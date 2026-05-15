import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  Like,
  QueryFailedError,
  SelectQueryBuilder,
} from 'typeorm';
import {
  Flavour,
  Product,
  ProductBrand,
  ProductCategory,
  ProductFlavour,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { Asset, AssetStatus } from 'src/tenant-db/entities/asset.entity';
import {
  ASSET_RULES,
  AssetEntityType,
  AssetPurpose,
} from '../config/asset-rules.config';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { ActivityLogService } from './activity-log.service';
import { S3Service } from 'src/common/s3/s3.service';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

@Injectable()
export class ProductService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
  ) {}

  private dedupeAssetIdsPreserveOrder(ids: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  private async collectApprovedProductImageUrls(
    manager: EntityManager,
    tenantCode: string,
    assetIds: string[],
    user: { userId: string },
  ): Promise<string[]> {
    const assetRepo = manager.getRepository(Asset);
    const urls: string[] = [];

    for (const assetId of assetIds) {
      const asset = await assetRepo.findOne({ where: { id: assetId } });
      if (!asset) {
        throw new NotFoundException(`Asset ${assetId} not found`);
      }
      if (asset.uploadedById !== user.userId) {
        throw new ForbiddenException(`Not allowed to use asset ${assetId}`);
      }
      if (asset.status !== AssetStatus.APPROVED) {
        throw new BadRequestException(
          `Asset ${assetId} must be confirmed (APPROVED) before attaching to a product`,
        );
      }
      if (asset.purpose !== AssetPurpose.PRODUCT_IMAGE) {
        throw new BadRequestException(`Asset ${assetId} is not a product image`);
      }
      if (asset.entityId != null || asset.attachedAt != null) {
        throw new BadRequestException(`Asset ${assetId} is already linked to an entity`);
      }
      const productImageRules = ASSET_RULES[AssetPurpose.PRODUCT_IMAGE];
      const tempPrefix = `tenants/${tenantCode}/temp/uploads/${asset.id}.`;
      const finalPrefix = `tenants/${tenantCode}/${productImageRules.folder}/${asset.id}.`;
      if (!asset.s3Key.startsWith(tempPrefix) && !asset.s3Key.startsWith(finalPrefix)) {
        throw new BadRequestException(`Asset ${assetId} has an unexpected storage key`);
      }
      urls.push(this.s3Service.getObjectUrl(asset.s3Key));
    }

    return urls;
  }

  private parseCsvIds(value?: string | null): string[] {
    if (!value?.trim()) {
      return [];
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async ensureCategoryExists(tenantDb: DataSource, categoryId: string) {
    const category = await tenantDb.getRepository(ProductCategory).findOne({
      where: { id: categoryId },
      select: ['id'],
    });
    if (!category) {
      throw new NotFoundException('Product category not found');
    }
  }

  private async ensureBrandExists(tenantDb: DataSource, brandId: string) {
    const brand = await tenantDb.getRepository(ProductBrand).findOne({
      where: { id: brandId },
      select: ['id'],
    });
    if (!brand) {
      throw new NotFoundException('Product brand not found');
    }
  }

  private async ensureSkuUnique(
    tenantDb: DataSource,
    skuCode: string,
    excludeProductId?: string,
  ) {
    const qb = tenantDb
      .getRepository(Product)
      .createQueryBuilder('product')
      .where('product.skuCode = :skuCode', { skuCode })
      .andWhere('product.isDelete = :isDelete', { isDelete: false });

    if (excludeProductId) {
      qb.andWhere('product.id != :excludeProductId', { excludeProductId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Product with this SKU already exists');
    }
  }

  private async ensureFlavoursExist(tenantDb: DataSource, flavourIds: string[]) {
    const uniqueFlavourIds = [...new Set(flavourIds)];
    const count = await tenantDb.getRepository(Flavour).count({
      where: { id: In(uniqueFlavourIds) },
    });

    if (count !== uniqueFlavourIds.length) {
      throw new NotFoundException('One or more flavours not found');
    }
  }

  private async ensureUomsExist(tenantDb: DataSource, uomIds: string[]) {
    const uniqueUomIds = [...new Set(uomIds)];
    const count = await tenantDb.getRepository(Uom).count({
      where: { id: In(uniqueUomIds) },
    });

    if (count !== uniqueUomIds.length) {
      throw new NotFoundException('One or more UOMs not found');
    }
  }

  async create(tenantDb: DataSource, tenantCode: string, dto: CreateProductDto, user: any) {
    const categoryId = dto.categoryId.trim();
    const brandId = dto.brandId?.trim();
    const skuCode = dto.skuCode.trim();
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    const hsCode = dto.hsCode?.trim() || null;
    const flavourIds = dto.flavourIds.map((id) => id.trim()).filter(Boolean);

    await this.ensureCategoryExists(tenantDb, categoryId);
    if (brandId) {
      await this.ensureBrandExists(tenantDb, brandId);
    }
    await this.ensureSkuUnique(tenantDb, skuCode);
    await this.ensureFlavoursExist(tenantDb, flavourIds);
    await this.ensureUomsExist(
      tenantDb,
      dto.pricing.map((item) => item.uomId.trim()),
    );

    const uniqueAssetIds = dto.assetIds?.length
      ? this.dedupeAssetIdsPreserveOrder(
          dto.assetIds.map((id) => id.trim()).filter(Boolean),
        )
      : [];

    const createdProduct = await tenantDb.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const productFlavourRepo = manager.getRepository(ProductFlavour);
      const productPricingRepo = manager.getRepository(ProductPricing);
      const assetRepo = manager.getRepository(Asset);

      let productImage: string | null = dto.image?.trim() || null;
      if (uniqueAssetIds.length) {
        const urls = await this.collectApprovedProductImageUrls(
          manager,
          tenantCode,
          uniqueAssetIds,
          user,
        );
        productImage = urls.join(',');
      }

      const product = productRepo.create({
        categoryId,
        brandId: brandId || null,
        skuCode,
        name,
        description,
        hsCode,
        image: productImage,
        isActive: dto.isActive,
        createdBy: user.userId,
      });

      const savedProduct = await productRepo.save(product);

      if (uniqueAssetIds.length) {
        const now = new Date();
        for (const assetId of uniqueAssetIds) {
          await assetRepo.update(
            { id: assetId },
            {
              entityType: AssetEntityType.PRODUCT,
              entityId: savedProduct.id,
              attachedAt: now,
            },
          );
        }
      }

      const flavourRows = [...new Set(flavourIds)].map((flavourId) =>
        productFlavourRepo.create({
          productId: savedProduct.id,
          flavourId,
        }),
      );
      await productFlavourRepo.save(flavourRows);

      const pricingRows = dto.pricing.map((price) =>
        productPricingRepo.create({
          productId: savedProduct.id,
          uomId: price.uomId.trim(),
          tradePrice: price.tradePrice,
          retailPrice: price.retailPrice,
          // convert it to number
          quantity: Number(price.quantity),
        }),
      );
      await productPricingRepo.save(pricingRows);

      return savedProduct;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CREATED',
      description: `Product ${createdProduct.name} created`,
      metadata: { productId: createdProduct.id, skuCode: createdProduct.skuCode },
    });

    return this.view(tenantDb, createdProduct.id, user);
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    user: any,
    search?: string,
    categoryIdParam?: string,
    brandIdParam?: string,
  ) {
    const qb = tenantDb
      .getRepository(Product)
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.brand', 'brand')
      .where('product.isDelete = :isDelete', { isDelete: false });
  
    if (categoryIdParam) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: categoryIdParam });
    }
  
    if (brandIdParam) {
      qb.andWhere('product.brandId = :brandId', { brandId: brandIdParam });
    }
  
    if (search) {
      qb.andWhere('product.name LIKE :search', { search: `%${search}%` });
      qb.orWhere('product.skuCode LIKE :search', { search: `%${search}%` });
    }
  
    qb.orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
  
    const [products, total] = await qb.getManyAndCount();
  
    const productIds = products.map((product) => product.id);
  
    let result = products as Array<Product & { flavourCount: number; pricingCount: number }>;
  
    if (productIds.length) {
      const flavourRows = await tenantDb
        .getRepository(ProductFlavour)
        .createQueryBuilder('pf')
        .select('pf.productId', 'productId')
        .addSelect('COUNT(*)', 'count')
        .where('pf.productId IN (:...productIds)', { productIds })
        .groupBy('pf.productId')
        .getRawMany<{ productId: string; count: string }>();
  
      const pricingRows = await tenantDb
        .getRepository(ProductPricing)
        .createQueryBuilder('pp')
        .select('pp.productId', 'productId')
        .addSelect('COUNT(*)', 'count')
        .where('pp.productId IN (:...productIds)', { productIds })
        .groupBy('pp.productId')
        .getRawMany<{ productId: string; count: string }>();
  
      const flavourCountByProductId = new Map(
        flavourRows.map((row) => [row.productId, Number(row.count)]),
      );
      const pricingCountByProductId = new Map(
        pricingRows.map((row) => [row.productId, Number(row.count)]),
      );
  
      result = products.map((product) => ({
        ...product,
        flavourCount: flavourCountByProductId.get(product.id) ?? 0,
        pricingCount: pricingCountByProductId.get(product.id) ?? 0,
      }));
    }

    // total, totalActive, totalInactive, totalCategories
    const totalActive = await tenantDb.getRepository(Product).count({
      where: { isDelete: false, isActive: true },
    });
    const totalInactive = await tenantDb.getRepository(Product).count({
      where: { isDelete: false, isActive: false },
    });
    const totalProducts = await tenantDb.getRepository(Product).count({
      where: { isDelete: false },
    });
    const totalCategories = await tenantDb.getRepository(ProductCategory).count({
    });
  
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_LISTED',
      description: 'Products listed',
      metadata: { total, page, limit },
    });
  
    return { totalActive, totalInactive, totalProducts, totalCategories, result, meta: { total, page, limit }, };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const product = await tenantDb.getRepository(Product).findOne({
      where: { id, isDelete: false },
      relations: [
        'category',
        'brand',
        'flavours',
        'flavours.flavour',
        'pricing',
        'pricing.uom',
      ],
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_VIEWED',
      description: `Product ${product.name} viewed`,
      metadata: { productId: product.id },
    });

    return product;
  }

  async edit(
    tenantDb: DataSource,
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
    user: any,
  ) {
    let logName: string;
    let logSku: string;

    await tenantDb.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const product = await productRepo.findOne({
        where: { id, isDelete: false },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (dto.categoryId !== undefined) {
        await this.ensureCategoryExists(tenantDb, dto.categoryId.trim());
        product.categoryId = dto.categoryId.trim();
      }

      if (dto.brandId !== undefined) {
        const nextBrandId = dto.brandId?.trim();
        if (nextBrandId) {
          await this.ensureBrandExists(tenantDb, nextBrandId);
          product.brandId = nextBrandId;
        } else {
          product.brandId = null;
        }
      }

      if (dto.skuCode !== undefined) {
        const skuCode = dto.skuCode.trim();
        await this.ensureSkuUnique(tenantDb, skuCode, id);
        product.skuCode = skuCode;
      }

      if (dto.name !== undefined) {
        product.name = dto.name.trim();
      }

      if (dto.description !== undefined) {
        product.description = dto.description?.trim() || null;
      }

      if (dto.hsCode !== undefined) {
        product.hsCode = dto.hsCode?.trim() || null;
      }

      const assetRepo = manager.getRepository(Asset);

      if (dto.assetIds !== undefined) {
        await assetRepo.update(
          {
            entityType: AssetEntityType.PRODUCT,
            entityId: product.id,
            purpose: AssetPurpose.PRODUCT_IMAGE,
          },
          {
            entityType: null,
            entityId: null,
            attachedAt: null,
          },
        );

        const uniqueAssetIds = dto.assetIds.length
          ? this.dedupeAssetIdsPreserveOrder(
              dto.assetIds.map((aid) => aid.trim()).filter(Boolean),
            )
          : [];

        if (uniqueAssetIds.length) {
          const urls = await this.collectApprovedProductImageUrls(
            manager,
            tenantId,
            uniqueAssetIds,
            user,
          );
          product.image = urls.join(',');
        } else {
          product.image = dto.image?.trim() || null;
        }
      } else if (dto.image !== undefined) {
        product.image = dto.image?.trim() || null;
      }

      if (dto.isActive !== undefined) {
        product.isActive = dto.isActive;
      }

      if (dto.flavourIds !== undefined) {
        const flavourIds = dto.flavourIds.map((item) => item.trim()).filter(Boolean);
        if (flavourIds.length) {
          await this.ensureFlavoursExist(tenantDb, flavourIds);
        }
        const requestedFlavourIds = [...new Set(flavourIds)];
        const productFlavourRepo = manager.getRepository(ProductFlavour);
        const existingFlavours = await productFlavourRepo.find({
          where: { productId: product.id },
        });
        const existingFlavourIdSet = new Set(existingFlavours.map((item) => item.flavourId));

        const newFlavourRows = requestedFlavourIds
          .filter((flavourId) => !existingFlavourIdSet.has(flavourId))
          .map((flavourId) =>
            productFlavourRepo.create({
              productId: product.id,
              flavourId,
            }),
          );

        if (newFlavourRows.length) {
          await productFlavourRepo.save(newFlavourRows);
        }

        const flavourRowsToRemove = existingFlavours.filter(
          (item) => !requestedFlavourIds.includes(item.flavourId),
        );
        for (const row of flavourRowsToRemove) {
          try {
            await productFlavourRepo.delete({ id: row.id });
          } catch (error) {
            if (
              error instanceof QueryFailedError &&
              (error as any).driverError?.code === '23503'
            ) {
              throw new BadRequestException(
                `Flavour is already in use and cannot be removed from this product.`,
              );
            }
            throw error;
          }
        }
      }

      if (dto.pricing !== undefined) {
        if (dto.pricing.length) {
          await this.ensureUomsExist(
            tenantDb,
            dto.pricing.map((item) => item.uomId.trim()),
          );
        }
        const requestedPricingByUom = new Map(
          dto.pricing.map((item) => [
            item.uomId.trim(),
            {
              tradePrice: item.tradePrice,
              retailPrice: item.retailPrice,
              quantity: Number(item.quantity),
            },
          ]),
        );
        const requestedUomIds = [...requestedPricingByUom.keys()];
        const productPricingRepo = manager.getRepository(ProductPricing);
        const existingPricing = await productPricingRepo.find({
          where: { productId: product.id },
        });

        const existingPricingByUom = new Map(
          existingPricing.map((item) => [item.uomId, item]),
        );

        for (const [uomId, requestedPricing] of requestedPricingByUom) {
          const currentPricing = existingPricingByUom.get(uomId);
          if (currentPricing) {
            currentPricing.tradePrice = requestedPricing.tradePrice;
            currentPricing.retailPrice = requestedPricing.retailPrice;
            currentPricing.quantity = requestedPricing.quantity;
            await productPricingRepo.save(currentPricing);
            continue;
          }

          await productPricingRepo.save(
            productPricingRepo.create({
              productId: product.id,
              uomId,
              tradePrice: requestedPricing.tradePrice,
              retailPrice: requestedPricing.retailPrice,
              quantity: requestedPricing.quantity,
            }),
          );
        }

        const pricingRowsToRemove = existingPricing.filter(
          (item) => !requestedUomIds.includes(item.uomId),
        );
        for (const row of pricingRowsToRemove) {
          try {
            await productPricingRepo.delete({ id: row.id });
          } catch (error) {
            if (
              error instanceof QueryFailedError &&
              (error as any).driverError?.code === '23503'
            ) {
              throw new BadRequestException(
                `Pricing is already in use and cannot be removed from this product.`,
              );
            }
            throw error;
          }
        }
      }

      await productRepo.save(product);

      if (dto.assetIds !== undefined) {
        const uniqueAssetIds = dto.assetIds.length
          ? this.dedupeAssetIdsPreserveOrder(
              dto.assetIds.map((aid) => aid.trim()).filter(Boolean),
            )
          : [];
        if (uniqueAssetIds.length) {
          const now = new Date();
          for (const assetId of uniqueAssetIds) {
            await assetRepo.update(
              { id: assetId },
              {
                entityType: AssetEntityType.PRODUCT,
                entityId: product.id,
                attachedAt: now,
              },
            );
          }
        }
      }

      logName = product.name;
      logSku = product.skuCode;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_UPDATED',
      description: `Product ${logName} updated`,
      metadata: { productId: id, skuCode: logSku },
    });

    return this.view(tenantDb, id, user);
  }

  async updateStatus(tenantDb: DataSource, id: string, status: boolean, user: any) {
    const product = await tenantDb.getRepository(Product).findOne({
      where: { id, isDelete: false },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    product.isActive = status;
    await tenantDb.getRepository(Product).save(product);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_STATUS_UPDATED',
      description: `Product ${product.name} status updated to ${status}`,
      metadata: { productId: product.id, status },
    });

    return {
      message: 'Product status updated successfully',
      product: {
        id: product.id,
        name: product.name,
        status: product.isActive,
      },
    };
  }
}
