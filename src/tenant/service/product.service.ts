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
  ProductSubCategory,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { Asset, AssetStatus } from 'src/tenant-db/entities/asset.entity';
import {
  ASSET_RULES,
  AssetEntityType,
  AssetPurpose,
} from '../config/asset-rules.config';
import { ActivityLogService } from './activity-log.service';
import { S3Service } from 'src/common/s3/s3.service';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { createChartOfAccountForProduct } from 'src/tenant-db/helpers/product-chart-of-account.helper';
import { CreateProductAsyncDto } from '../dto/product/create-product-async.dto';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { UpdateProductAsyncDto } from '../dto/product/update-product-async.dto';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import { BatchPickStrategy } from 'src/tenant-db/entities/product.entity';
import { generateSequentialCode } from './hr/hr-common.util';

const SKU_CODE_PREFIX = 'SKU';

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

  private async ensureCategoryExists(tenantDb: DataSource, categoryId: string, user: any) {
    const category = await tenantDb.getRepository(ProductCategory).findOne({
      where: { id: categoryId },
      select: ['id'],
    });
    if (!category) {
      throw new NotFoundException('Product category not found');
    }
  }

  private async ensureSubCategoryExists(
    tenantDb: DataSource,
    subCategoryId: string,
    categoryId: string,
    user: any,
  ) {
    const subCategory = await tenantDb.getRepository(ProductSubCategory).findOne({
      where: { id: subCategoryId, businessId: user.businessId },
      select: ['id', 'categoryId'],
    });

    if (!subCategory) {
      throw new NotFoundException('Product sub category not found');
    }

    if (subCategory.categoryId !== categoryId) {
      throw new BadRequestException(
        'Sub category does not belong to the selected category',
      );
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

  private async ensureBarcodeUnique(tenantDb: DataSource, barcode: string) {
    const existing = await tenantDb.getRepository(Product).findOne({
      where: { barcode, isDelete: false },
    });
    if (existing) {
      throw new ConflictException('Product with this barcode already exists');
    }
  }

  private async resolveSkuCode(
    tenantDb: DataSource,
    skuCode?: string | null,
  ): Promise<string> {
    const resolved =
      skuCode?.trim() ||
      (await generateSequentialCode(
        tenantDb,
        Product,
        'product',
        'skuCode',
        SKU_CODE_PREFIX,
      ));

    await this.ensureSkuUnique(tenantDb, resolved);
    return resolved;
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

  async validateForCreate(
    tenantDb: DataSource,
    dto: CreateProductAsyncDto,
    user: any,
  ): Promise<void> {
    const categoryId = dto.categoryId.trim();
    const subCategoryId = dto.subCategoryId.trim();
    const brandId = dto.brandId?.trim();
    const barcode = dto.barcode?.trim() || null;
    const flavourIds = (dto.flavourIds ?? []).map((id) => id.trim()).filter(Boolean);
    const skuCode = dto.skuCode?.trim();

    await this.ensureCategoryExists(tenantDb, categoryId, user);
    await this.ensureSubCategoryExists(tenantDb, subCategoryId, categoryId, user);
    if (barcode) {
      await this.ensureBarcodeUnique(tenantDb, barcode);
    }
    if (brandId) {
      await this.ensureBrandExists(tenantDb, brandId);
    }
    if (flavourIds.length) {
      await this.ensureFlavoursExist(tenantDb, flavourIds);
    }
    await this.ensureUomsExist(
      tenantDb,
      dto.pricing.map((item) => item.uomId.trim()),
    );
    if (skuCode) {
      await this.ensureSkuUnique(tenantDb, skuCode);
    }
  }

  async validateForUpdate(
    tenantDb: DataSource,
    id: string,
    dto: UpdateProductAsyncDto,
    user: any,
  ): Promise<Product> {
    const product = await tenantDb.getRepository(Product).findOne({
      where: { id, isDelete: false },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId !== undefined) {
      await this.ensureCategoryExists(tenantDb, dto.categoryId.trim(), user);
    }

    if (dto.subCategoryId !== undefined) {
      const categoryId = dto.categoryId?.trim() ?? product.categoryId;
      await this.ensureSubCategoryExists(
        tenantDb,
        dto.subCategoryId.trim(),
        categoryId,
        user,
      );
    } else if (dto.categoryId !== undefined && product.subCategoryId) {
      await this.ensureSubCategoryExists(
        tenantDb,
        product.subCategoryId,
        dto.categoryId.trim(),
        user,
      );
    }

    if (dto.brandId !== undefined) {
      const nextBrandId = dto.brandId?.trim();
      if (nextBrandId) {
        await this.ensureBrandExists(tenantDb, nextBrandId);
      }
    }

    if (dto.skuCode !== undefined) {
      await this.ensureSkuUnique(tenantDb, dto.skuCode.trim(), id);
    }

    if (dto.flavourIds !== undefined) {
      const flavourIds = dto.flavourIds.map((item) => item.trim()).filter(Boolean);
      if (flavourIds.length) {
        await this.ensureFlavoursExist(tenantDb, flavourIds);
      }
    }

    if (dto.pricing !== undefined && dto.pricing.length) {
      await this.ensureUomsExist(
        tenantDb,
        dto.pricing.map((item) => item.uomId.trim()),
      );
    }

    return product;
  }

  async createWithImageUrl(
    tenantDb: DataSource,
    dto: CreateProductAsyncDto,
    imageUrl: string | null,
    user: any,
  ): Promise<Product> {
    const categoryId = dto.categoryId.trim();
    const subCategoryId = dto.subCategoryId.trim();
    const brandId = dto.brandId?.trim();
    const skuCode = await this.resolveSkuCode(tenantDb, dto.skuCode);
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    const hsCode = dto.hsCode?.trim() || null;
    const flavourIds = (dto.flavourIds ?? []).map((id) => id.trim()).filter(Boolean);
    const batchPickStrategy = dto.batchPickStrategy ?? BatchPickStrategy.LIFO;

    return tenantDb.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const productFlavourRepo = manager.getRepository(ProductFlavour);
      const productPricingRepo = manager.getRepository(ProductPricing);

      const product = productRepo.create({
        businessId: user.businessId,
        categoryId,
        subCategoryId,
        brandId: brandId || null,
        skuCode,
        name,
        description,
        hsCode,
        image: imageUrl,
        isActive: dto.isActive,
        createdBy: user.userId,
        batchPickStrategy,
      });

      const savedProduct = await productRepo.save(product);
      await createChartOfAccountForProduct(manager, savedProduct);

      if (flavourIds.length) {
        const flavourRows = [...new Set(flavourIds)].map((flavourId) =>
          productFlavourRepo.create({
            productId: savedProduct.id,
            flavourId,
          }),
        );
        await productFlavourRepo.save(flavourRows);
      }

      const pricingRows = dto.pricing.map((price) =>
        productPricingRepo.create({
          productId: savedProduct.id,
          uomId: price.uomId,
          purchaseUnitPrice: price.purchaseUnitPrice,
          saleUnitMarginAmount: price.saleUnitMarginAmount,
          saleUnitMarginPercentage: price.saleUnitMarginPercentage,
          quantity: price.quantity,
        }),
      );
      await productPricingRepo.save(pricingRows);

      return savedProduct;
    });
  }

  async create(tenantDb: DataSource, tenantCode: string, dto: CreateProductDto, user: any) {
    await this.validateForCreate(tenantDb, dto, user);

    const uniqueAssetIds = dto.assetIds?.length
      ? this.dedupeAssetIdsPreserveOrder(
          dto.assetIds.map((id) => id.trim()).filter(Boolean),
        )
      : [];

    let productImage: string | null = dto.image?.trim() || null;
    if (uniqueAssetIds.length) {
      productImage = await tenantDb.transaction(async (manager) => {
        const urls = await this.collectApprovedProductImageUrls(
          manager,
          tenantCode,
          uniqueAssetIds,
          user,
        );
        return urls.join(',');
      });
    }

    const createdProduct = await this.createWithImageUrl(
      tenantDb,
      dto,
      productImage,
      user,
    );

    if (uniqueAssetIds.length) {
      const now = new Date();
      const assetRepo = tenantDb.getRepository(Asset);
      for (const assetId of uniqueAssetIds) {
        await assetRepo.update(
          { id: assetId },
          {
            entityType: AssetEntityType.PRODUCT,
            entityId: createdProduct.id,
            attachedAt: now,
          },
        );
      }
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
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
      .leftJoinAndSelect('product.subCategory', 'subCategory')
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
      businessId: user.businessId,
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
        'subCategory',
        'brand',
        'chartOfAccount',
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
      businessId: user.businessId,
      action: 'PRODUCT_VIEWED',
      description: `Product ${product.name} viewed`,
      metadata: { productId: product.id },
    });

    return product;
  }

  async updateWithImageUrl(
    tenantDb: DataSource,
    id: string,
    dto: UpdateProductAsyncDto,
    imageUrl: string | undefined,
    user: any,
  ): Promise<Product> {
    return tenantDb.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const product = await productRepo.findOne({
        where: { id, isDelete: false },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (dto.batchPickStrategy !== undefined) {
        product.batchPickStrategy = dto.batchPickStrategy ?? BatchPickStrategy.LIFO;
      }

      if (dto.barcode !== undefined) {
        product.barcode = dto.barcode?.trim() || null;
      }

      if (dto.categoryId !== undefined) {
        product.categoryId = dto.categoryId.trim();
      }

      if (dto.subCategoryId !== undefined) {
        product.subCategoryId = dto.subCategoryId.trim();
      }

      if (dto.brandId !== undefined) {
        const nextBrandId = dto.brandId?.trim();
        product.brandId = nextBrandId || null;
      }

      if (dto.skuCode !== undefined) {
        product.skuCode = dto.skuCode.trim();
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

      if (imageUrl !== undefined) {
        product.image = imageUrl;
      }

      if (dto.isActive !== undefined) {
        product.isActive = dto.isActive;
      }

      if (dto.flavourIds !== undefined) {
        const flavourIds = dto.flavourIds.map((item) => item.trim()).filter(Boolean);
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
        const requestedPricingByUom = new Map(
          dto.pricing.map((item) => [
            item.uomId.trim(),
            {
              purchaseUnitPrice: item.purchaseUnitPrice,
              saleUnitMarginAmount: item.saleUnitMarginAmount,
              saleUnitMarginPercentage: item.saleUnitMarginPercentage,
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
            currentPricing.purchaseUnitPrice = requestedPricing.purchaseUnitPrice;
            currentPricing.saleUnitMarginAmount = requestedPricing.saleUnitMarginAmount;
            currentPricing.saleUnitMarginPercentage = requestedPricing.saleUnitMarginPercentage;
            currentPricing.quantity = requestedPricing.quantity;
            await productPricingRepo.save(currentPricing);
            continue;
          }

          await productPricingRepo.save(
            productPricingRepo.create({
              productId: product.id,
              uomId,
              purchaseUnitPrice: requestedPricing.purchaseUnitPrice,
              saleUnitMarginAmount: requestedPricing.saleUnitMarginAmount,
              saleUnitMarginPercentage: requestedPricing.saleUnitMarginPercentage,
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

      return productRepo.save(product);
    });
  }

  async edit(
    tenantDb: DataSource,
    tenantCode: string,
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

      if (dto.batchPickStrategy !== undefined) {
        const batchPickStrategy = dto.batchPickStrategy ?? BatchPickStrategy.LIFO;
        product.batchPickStrategy = batchPickStrategy;
      }

      if (dto.barcode !== undefined) {
        const barcode = dto.barcode?.trim() || null;
        product.barcode = barcode;
      }

      if (dto.categoryId !== undefined) {
        await this.ensureCategoryExists(tenantDb, dto.categoryId.trim(), user);
        product.categoryId = dto.categoryId.trim();
      }

      if (dto.subCategoryId !== undefined) {
        const nextSubCategoryId = dto.subCategoryId.trim();
        await this.ensureSubCategoryExists(
          tenantDb,
          nextSubCategoryId,
          product.categoryId,
          user,
        );
        product.subCategoryId = nextSubCategoryId;
      } else if (dto.categoryId !== undefined && product.subCategoryId) {
        await this.ensureSubCategoryExists(
          tenantDb,
          product.subCategoryId,
          product.categoryId,
          user,
        );
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
            tenantCode,
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
              purchaseUnitPrice: item.purchaseUnitPrice,
              saleUnitMarginAmount: item.saleUnitMarginAmount,
              saleUnitMarginPercentage: item.saleUnitMarginPercentage,
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
            currentPricing.purchaseUnitPrice = requestedPricing.purchaseUnitPrice;
            currentPricing.saleUnitMarginAmount = requestedPricing.saleUnitMarginAmount;
            currentPricing.saleUnitMarginPercentage = requestedPricing.saleUnitMarginPercentage;
            currentPricing.quantity = requestedPricing.quantity;
            await productPricingRepo.save(currentPricing);
            continue;
          }

          await productPricingRepo.save(
            productPricingRepo.create({
              productId: product.id,
              uomId,
              purchaseUnitPrice: requestedPricing.purchaseUnitPrice,
              saleUnitMarginAmount: requestedPricing.saleUnitMarginAmount,
              saleUnitMarginPercentage: requestedPricing.saleUnitMarginPercentage,
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
      businessId: user.businessId,
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
      businessId: user.businessId,
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
