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
  ProductPricingType,
  ProductSubCategory,
  Uom,
  BatchPickStrategy,
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
import { basename, extname } from 'node:path';
import { extractS3KeyFromUrl } from '../utils/extract-s3-key-from-url';
import {
  snapshotUploadedFile,
  type UploadedFileSnapshot,
} from '../utils/snapshot-uploaded-file';
import {
  createChartOfAccountForProduct,
  ensureChartOfAccountForCategory,
  ensureChartOfAccountForSubCategory,
} from 'src/tenant-db/helpers/product-chart-of-account.helper';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';
import { CreateProductAsyncDto } from '../dto/product/create-product-async.dto';
import { CreateProductDto } from '../dto/product/create-product.dto';
import { UpdateProductAsyncDto } from '../dto/product/update-product-async.dto';
import { UpdateProductDto } from '../dto/product/update-product.dto';
import {
  ProductJsonImportDto,
  ProductJsonItemDto,
  ProductJsonPricingItemDto,
} from '../dto/product/product-json-export-import.dto';
import {
  JsonExportEntity,
  JsonImportMode,
  JsonImportResultRow,
  SALESVINCE_EXPORT_FORMAT,
} from '../dto/import-export/json-export-envelope.dto';
import { generateSequentialCode } from './hr/hr-common.util';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

const SKU_CODE_PREFIX = 'SKU';

type ProductImportRow = {
  row: number;
  title: string;
  brandName: string | null;
  description: string | null;
  category: string;
  subCategory: string;
  purchasePrice: number;
  salePrice: number;
  measurementUnit: string;
};

const PRODUCT_IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PRODUCT_IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class ProductService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
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
    user: any,
  ) {
    const subCategory = await tenantDb.getRepository(ProductSubCategory).findOne({
      where: { id: subCategoryId, businessId: user.businessId },
      select: ['id'],
    });

    if (!subCategory) {
      throw new NotFoundException('Product sub category not found');
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
    await this.ensureSubCategoryExists(tenantDb, subCategoryId, user);
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
      await this.ensureSubCategoryExists(
        tenantDb,
        dto.subCategoryId.trim(),
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
    const barcode = dto.barcode?.trim() || null;
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
        barcode,
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

      const pricingRows = dto.pricing.map((price) => {
        const normalized = this.normalizePricingRow(price);
        return productPricingRepo.create({
          productId: savedProduct.id,
          ...normalized,
        });
      });
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
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('product.name ILIKE :search', { search: `%${search}%` })
            .orWhere('product.skuCode ILIKE :search', { search: `%${search}%` });
        }),
      );
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
            this.normalizePricingRow(item),
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
            currentPricing.pricingType = requestedPricing.pricingType;
            currentPricing.purchaseUnitPrice = requestedPricing.purchaseUnitPrice;
            currentPricing.saleUnitMarginAmount =
              requestedPricing.saleUnitMarginAmount;
            currentPricing.saleUnitMarginPercentage =
              requestedPricing.saleUnitMarginPercentage;
            currentPricing.purchasePercentage =
              requestedPricing.purchasePercentage;
            currentPricing.salePercentage = requestedPricing.salePercentage;
            currentPricing.quantity = requestedPricing.quantity;
            await productPricingRepo.save(currentPricing);
            continue;
          }

          await productPricingRepo.save(
            productPricingRepo.create({
              productId: product.id,
              ...requestedPricing,
              uomId,
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
          user,
        );
        product.subCategoryId = nextSubCategoryId;
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
            this.normalizePricingRow(item),
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
            currentPricing.pricingType = requestedPricing.pricingType;
            currentPricing.purchaseUnitPrice = requestedPricing.purchaseUnitPrice;
            currentPricing.saleUnitMarginAmount =
              requestedPricing.saleUnitMarginAmount;
            currentPricing.saleUnitMarginPercentage =
              requestedPricing.saleUnitMarginPercentage;
            currentPricing.purchasePercentage =
              requestedPricing.purchasePercentage;
            currentPricing.salePercentage = requestedPricing.salePercentage;
            currentPricing.quantity = requestedPricing.quantity;
            await productPricingRepo.save(currentPricing);
            continue;
          }

          await productPricingRepo.save(
            productPricingRepo.create({
              productId: product.id,
              ...requestedPricing,
              uomId,
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

  private validateProductImageFile(file: UploadedFileSnapshot): void {
    const rules = ASSET_RULES[AssetPurpose.PRODUCT_IMAGE];
    const allowedMimeTypes = rules.allowedMimeTypes as readonly string[];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File MIME type ${file.mimetype} is not allowed. Allowed: ${allowedMimeTypes.join(', ')}`,
      );
    }

    if (file.size > rules.maxSizeBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${rules.maxSizeBytes} bytes`,
      );
    }
  }

  private sanitizeProductImageFileName(name: string): string {
    const base = basename(name).trim();
    return base.length > 0 ? base.slice(0, 512) : 'unnamed';
  }

  private resolveProductImageExtension(file: UploadedFileSnapshot): string {
    const fromMime = PRODUCT_IMAGE_MIME_TO_EXTENSION[file.mimetype];
    if (!fromMime) {
      throw new BadRequestException('Could not map image MIME type to an extension');
    }

    let ext = extname(file.originalname).toLowerCase().replace(/^\./, '');
    if (ext === 'jpeg') {
      ext = 'jpg';
    }

    const allowedForMime: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
    };
    const names = allowedForMime[file.mimetype];
    if (ext && names?.includes(ext)) {
      return ext;
    }

    return fromMime;
  }

  private resolveProductImageContentType(fileExtension: string): string {
    const contentType = PRODUCT_IMAGE_EXTENSION_TO_MIME[fileExtension.toLowerCase()];
    if (!contentType) {
      throw new BadRequestException('Unsupported file extension for content type resolution');
    }

    return contentType;
  }

  private async removeLinkedProductImageAssets(
    manager: EntityManager,
    productId: string,
    excludeAssetId?: string,
  ): Promise<string[]> {
    const assetRepo = manager.getRepository(Asset);
    const linkedAssets = await assetRepo.find({
      where: {
        entityType: AssetEntityType.PRODUCT,
        entityId: productId,
        purpose: AssetPurpose.PRODUCT_IMAGE,
      },
    });

    const s3Keys: string[] = [];
    for (const asset of linkedAssets) {
      if (excludeAssetId && asset.id === excludeAssetId) {
        continue;
      }
      s3Keys.push(asset.s3Key);
      await assetRepo.delete({ id: asset.id });
    }

    return s3Keys;
  }

  private async deleteS3Keys(keys: Iterable<string | null | undefined>): Promise<void> {
    const uniqueKeys = [
      ...new Set(
        [...keys].filter((key): key is string => Boolean(key?.trim())),
      ),
    ];

    await Promise.all(
      uniqueKeys.map((key) => this.s3Service.deleteObject(key).catch(() => undefined)),
    );
  }

  async uploadProductImage(
    tenantDb: DataSource,
    tenantCode: string,
    productId: string,
    file: Express.Multer.File | undefined,
    user: any,
  ) {
    const snapshot = snapshotUploadedFile(file, 'image');
    if (!snapshot) {
      throw new BadRequestException('Image file is required');
    }

    this.validateProductImageFile(snapshot);

    const product = await tenantDb.getRepository(Product).findOne({
      where: { id: productId, isDelete: false },
      select: ['id', 'name', 'skuCode', 'image'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const previousImageKey = extractS3KeyFromUrl(product.image);
    const rules = ASSET_RULES[AssetPurpose.PRODUCT_IMAGE];
    const assetId = randomUUID();
    const extension = this.resolveProductImageExtension(snapshot);
    const tempKey = `tenants/${tenantCode}/temp/uploads/${assetId}.${extension}`;
    const destKey = `tenants/${tenantCode}/${rules.folder}/${assetId}.${extension}`;
    const contentType = this.resolveProductImageContentType(extension);
    let uploadedTemp = false;

    try {
      await this.s3Service.uploadObject(tempKey, snapshot.buffer, snapshot.mimetype);
      uploadedTemp = true;
      await this.s3Service.copyObject(tempKey, destKey, contentType);

      const now = new Date();
      const imageUrl = this.s3Service.getObjectUrl(destKey);
      let oldAssetKeys: string[] = [];

      await tenantDb.transaction(async (manager) => {
        const assetRepo = manager.getRepository(Asset);
        const productRepo = manager.getRepository(Product);

        const asset = assetRepo.create({
          id: assetId,
          uploadedById: user.userId,
          purpose: AssetPurpose.PRODUCT_IMAGE,
          s3Key: destKey,
          entityType: AssetEntityType.PRODUCT,
          entityId: productId,
          originalFileName: this.sanitizeProductImageFileName(snapshot.originalname),
          fileExtension: extension,
          fileSize: snapshot.size,
          status: AssetStatus.APPROVED,
          confirmedAt: now,
          attachedAt: now,
        });
        await assetRepo.save(asset);

        oldAssetKeys = await this.removeLinkedProductImageAssets(
          manager,
          productId,
          assetId,
        );

        await productRepo.update(productId, { image: imageUrl });
      });

      await this.s3Service.deleteObject(tempKey).catch(() => undefined);
      await this.deleteS3Keys([...oldAssetKeys, previousImageKey]);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'PRODUCT_IMAGE_UPLOADED',
        description: `Product ${product.name} image uploaded`,
        metadata: { productId, assetId, skuCode: product.skuCode },
      });

      return this.view(tenantDb, productId, user);
    } catch (error) {
      if (uploadedTemp) {
        await this.s3Service.deleteObject(tempKey).catch(() => undefined);
      }
      await this.s3Service.deleteObject(destKey).catch(() => undefined);
      throw error;
    }
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

  private sanitizeImportText(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value ?? '').trim();
    }
    return value.trim();
  }

  private slugifyImportText(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private roundImportAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private parseImportNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeImportHeaderKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, '');
  }

  private getImportRowValue(
    row: Record<string, unknown>,
    ...keys: string[]
  ): unknown {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(this.normalizeImportHeaderKey(key), value);
    }
    for (const key of keys) {
      const value = normalizedRow.get(this.normalizeImportHeaderKey(key));
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private computePricingFromCsv(purchasePrice: number, salePrice: number) {
    const marginAmount = this.roundImportAmount(salePrice - purchasePrice);
    const marginPercentage =
      purchasePrice > 0
        ? this.roundImportAmount((marginAmount / purchasePrice) * 100)
        : 0;
    return {
      purchaseUnitPrice: this.roundImportAmount(purchasePrice),
      saleUnitMarginAmount: marginAmount,
      saleUnitMarginPercentage: marginPercentage,
    };
  }

  private parseProductRowsFromFile(file: Express.Multer.File): ProductImportRow[] {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const rows: ProductImportRow[] = [];
    rawRows.forEach((row, index) => {
      const title = this.sanitizeImportText(this.getImportRowValue(row, 'title', 'name'));
      const category = this.sanitizeImportText(this.getImportRowValue(row, 'category'));
      const subCategory = this.sanitizeImportText(
        this.getImportRowValue(row, 'subCategory', 'subcategory'),
      );
      const measurementUnit = this.sanitizeImportText(
        this.getImportRowValue(row, 'measurementUnit', 'uom'),
      );
      const purchasePrice = this.parseImportNumber(
        this.getImportRowValue(row, 'purchasePrice', 'purchaseprice'),
      );
      const salePrice = this.parseImportNumber(
        this.getImportRowValue(row, 'salePrice', 'saleprice'),
      );

      if (
        !title ||
        title.toLowerCase() === 'title' ||
        !category ||
        !subCategory ||
        !measurementUnit ||
        purchasePrice === null ||
        salePrice === null
      ) {
        return;
      }

      const brandNameRaw = this.sanitizeImportText(
        this.getImportRowValue(row, 'brandName', 'brand'),
      );
      const descriptionRaw = this.sanitizeImportText(
        this.getImportRowValue(row, 'description'),
      );

      rows.push({
        row: index + 2,
        title,
        brandName: brandNameRaw || null,
        description: descriptionRaw || null,
        category,
        subCategory,
        purchasePrice,
        salePrice,
        measurementUnit,
      });
    });

    return rows;
  }

  private async findOrCreateCategory(
    manager: EntityManager,
    name: string,
    user: { businessId: string; userId: string },
    cache: Map<string, ProductCategory>,
  ): Promise<ProductCategory> {
    const cacheKey = name.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const categoryRepo = manager.getRepository(ProductCategory);
    const slug = this.slugifyImportText(name);
    let category = await categoryRepo.findOne({
      where: { name, businessId: user.businessId },
    });
    if (!category && slug) {
      category = await categoryRepo.findOne({
        where: { slug, businessId: user.businessId },
      });
    }

    if (!category) {
      category = await categoryRepo.save(
        categoryRepo.create({
          name,
          slug: slug || this.slugifyImportText(name),
          businessId: user.businessId,
          createdBy: user.userId,
        }),
      );
      await ensureChartOfAccountForCategory(manager, category);
    }

    cache.set(cacheKey, category);
    return category;
  }

  private async findOrCreateSubCategory(
    manager: EntityManager,
    name: string,
    user: { businessId: string },
    cache: Map<string, ProductSubCategory>,
  ): Promise<ProductSubCategory> {
    const cacheKey = name.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const subCategoryRepo = manager.getRepository(ProductSubCategory);
    const slug = this.slugifyImportText(name);
    let subCategory = await subCategoryRepo.findOne({
      where: {
        name,
        businessId: user.businessId,
      },
    });
    if (!subCategory && slug) {
      subCategory = await subCategoryRepo.findOne({
        where: {
          slug,
          businessId: user.businessId,
        },
      });
    }

    if (!subCategory) {
      subCategory = await subCategoryRepo.save(
        subCategoryRepo.create({
          name,
          slug: slug || this.slugifyImportText(name),
          categoryId: null,
          businessId: user.businessId,
        }),
      );
      await ensureChartOfAccountForSubCategory(manager, subCategory);
    }

    cache.set(cacheKey, subCategory);
    return subCategory;
  }

  private async findOrCreateBrand(
    manager: EntityManager,
    name: string,
    user: { businessId: string },
    cache: Map<string, ProductBrand>,
  ): Promise<ProductBrand> {
    const cacheKey = name.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const brandRepo = manager.getRepository(ProductBrand);
    let brand = await brandRepo.findOne({
      where: { name, businessId: user.businessId },
    });

    if (!brand) {
      brand = await brandRepo.save(
        brandRepo.create({ name, businessId: user.businessId }),
      );
    }

    cache.set(cacheKey, brand);
    return brand;
  }

  private async findOrCreateUom(
    manager: EntityManager,
    name: string,
    user: { businessId: string },
    cache: Map<string, Uom>,
  ): Promise<Uom> {
    const cacheKey = name.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const uomRepo = manager.getRepository(Uom);
    let uom = await uomRepo.findOne({
      where: { name, businessId: user.businessId },
    });

    if (!uom) {
      uom = await uomRepo.save(
        uomRepo.create({ name, businessId: user.businessId, isBase: false }),
      );
    }

    cache.set(cacheKey, uom);
    return uom;
  }

  private async notifyProductImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed' ? 'Product import completed' : 'Product import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        businessId: user.businessId,
        message,
        type: 'product_import',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
      },
    );
  }

  private async processProductImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: ProductImportRow[],
    user: any,
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const categoryCache = new Map<string, ProductCategory>();
    const subCategoryCache = new Map<string, ProductSubCategory>();
    const brandCache = new Map<string, ProductBrand>();
    const uomCache = new Map<string, Uom>();

    for (const row of rows) {
      try {
        const existingProduct = await tenantDb.getRepository(Product).findOne({
          where: { name: row.title, businessId: user.businessId, isDelete: false },
          select: ['id'],
        });
        if (existingProduct) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.title,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const resolved = await tenantDb.transaction(async (manager) => {
          const category = await this.findOrCreateCategory(
            manager,
            row.category,
            user,
            categoryCache,
          );
          const subCategory = await this.findOrCreateSubCategory(
            manager,
            row.subCategory,
            user,
            subCategoryCache,
          );
          const uom = await this.findOrCreateUom(
            manager,
            row.measurementUnit,
            user,
            uomCache,
          );
          let brandId: string | null = null;
          if (row.brandName) {
            const brand = await this.findOrCreateBrand(
              manager,
              row.brandName,
              user,
              brandCache,
            );
            brandId = brand.id;
          }

          const pricing = this.computePricingFromCsv(row.purchasePrice, row.salePrice);
          const dto: CreateProductAsyncDto = {
            categoryId: category.id,
            subCategoryId: subCategory.id,
            brandId: brandId ?? undefined,
            name: row.title,
            description: row.description ?? undefined,
            isActive: true,
            batchPickStrategy: BatchPickStrategy.LIFO,
            pricing: [
              this.normalizePricingRow({
                uomId: uom.id,
                pricingType: ProductPricingType.BY_AMOUNT,
                purchaseUnitPrice: pricing.purchaseUnitPrice,
                saleUnitMarginAmount: pricing.saleUnitMarginAmount,
                saleUnitMarginPercentage: pricing.saleUnitMarginPercentage,
                quantity: 1,
              }),
            ],
          };

          return { dto };
        });

        const created = await this.createWithImageUrl(
          tenantDb,
          resolved.dto,
          null,
          user,
        );

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.title,
          status: 'success',
          metadata: { productId: created.id, skuCode: created.skuCode },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.title,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Product import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyProductImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importProducts(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: any,
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseProductRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No product rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PRODUCT_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Product import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processProductImportJob(tenantDb, job.id, rows, user, tenantCode).catch(
      async (error) => {
        this.tenantJobService.failJob(job.id);
        this.tenantJobService.appendLog(job.id, {
          row: 0,
          name: '',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown processing failure',
        });
        const failedJob = this.tenantJobService.getJobById(
          job.id,
          tenantCode,
          user.userId,
        );

        await this.activityLogService.recordActivityLog(tenantDb, {
          actorId: user.userId,
          businessId: user.businessId,
          action: 'TENANT_JOB_FAILED',
          description: `Product import failed for ${file.originalname}`,
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            fileName: file.originalname,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        await this.notifyProductImportCompletion(
          tenantDb,
          failedJob,
          user,
          tenantCode,
          'failed',
        );
      },
    );

    return {
      message: 'Product import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private normalizePricingRow(price: {
    uomId: string;
    pricingType?: ProductPricingType;
    purchaseUnitPrice: number;
    saleUnitMarginAmount: number;
    saleUnitMarginPercentage: number;
    purchasePercentage?: number;
    salePercentage?: number;
    quantity: number;
  }): {
    uomId: string;
    pricingType: ProductPricingType;
    purchaseUnitPrice: number;
    saleUnitMarginAmount: number;
    saleUnitMarginPercentage: number;
    purchasePercentage: number;
    salePercentage: number;
    quantity: number;
  } {
    const pricingType = price.pricingType ?? ProductPricingType.BY_AMOUNT;
    const uomId = price.uomId.trim();
    const purchaseUnitPrice = Number(price.purchaseUnitPrice);
    const quantity = Number(price.quantity);

    if (pricingType === ProductPricingType.BY_MARGIN) {
      return {
        uomId,
        pricingType,
        purchaseUnitPrice,
        saleUnitMarginAmount: 0,
        saleUnitMarginPercentage: 0,
        purchasePercentage: Number(price.purchasePercentage ?? 0),
        salePercentage: Number(price.salePercentage ?? 0),
        quantity,
      };
    }

    return {
      uomId,
      pricingType: ProductPricingType.BY_AMOUNT,
      purchaseUnitPrice,
      saleUnitMarginAmount: Number(price.saleUnitMarginAmount),
      saleUnitMarginPercentage: Number(price.saleUnitMarginPercentage),
      purchasePercentage: 0,
      salePercentage: 0,
      quantity,
    };
  }

  private resolvePricingMargins(price: ProductJsonPricingItemDto): {
    purchaseUnitPrice: number;
    saleUnitMarginAmount: number;
    saleUnitMarginPercentage: number;
    quantity: number;
  } {
    const purchaseUnitPrice = this.roundMoney(Number(price.purchaseUnitPrice));
    const quantity = Math.max(1, Number(price.quantity) || 1);

    if (
      price.saleUnitMarginAmount != null &&
      price.saleUnitMarginPercentage != null
    ) {
      return {
        purchaseUnitPrice,
        saleUnitMarginAmount: this.roundMoney(Number(price.saleUnitMarginAmount)),
        saleUnitMarginPercentage: this.roundMoney(
          Number(price.saleUnitMarginPercentage),
        ),
        quantity,
      };
    }

    if (price.saleUnitPrice != null) {
      const computed = this.computePricingFromCsv(
        purchaseUnitPrice,
        Number(price.saleUnitPrice),
      );
      return { ...computed, quantity };
    }

    return {
      purchaseUnitPrice,
      saleUnitMarginAmount: this.roundMoney(
        Number(price.saleUnitMarginAmount ?? 0),
      ),
      saleUnitMarginPercentage: this.roundMoney(
        Number(price.saleUnitMarginPercentage ?? 0),
      ),
      quantity,
    };
  }

  private mapProductToJsonItem(product: Product): ProductJsonItemDto {
    return {
      skuCode: product.skuCode,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      hsCode: product.hsCode,
      isActive: product.isActive,
      batchPickStrategy: product.batchPickStrategy,
      category: { name: product.category?.name ?? '' },
      subCategory: { name: product.subCategory?.name ?? '' },
      brand: product.brand?.name ? { name: product.brand.name } : null,
      flavours: (product.flavours ?? [])
        .map((row) => row.flavour?.name)
        .filter((name): name is string => Boolean(name))
        .map((name) => ({ name })),
      pricing: (product.pricing ?? []).map((row) => {
        const purchase = Number(row.purchaseUnitPrice);
        const marginAmount = Number(row.saleUnitMarginAmount);
        return {
          uom: { name: row.uom?.name ?? '' },
          isBase: row.uom?.isBase ?? false,
          pricingType: row.pricingType ?? ProductPricingType.BY_AMOUNT,
          quantity: Number(row.quantity),
          purchaseUnitPrice: purchase,
          saleUnitPrice: this.roundMoney(purchase + marginAmount),
          saleUnitMarginAmount: marginAmount,
          saleUnitMarginPercentage: Number(row.saleUnitMarginPercentage),
          purchasePercentage: Number(row.purchasePercentage ?? 0),
          salePercentage: Number(row.salePercentage ?? 0),
        };
      }),
    };
  }

  private async findOrCreateFlavour(
    manager: EntityManager,
    name: string,
    user: { businessId: string },
    cache: Map<string, Flavour>,
  ): Promise<Flavour> {
    const cacheKey = name.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const flavourRepo = manager.getRepository(Flavour);
    let flavour = await flavourRepo.findOne({
      where: { name, businessId: user.businessId },
    });
    if (!flavour) {
      flavour = await flavourRepo.save(
        flavourRepo.create({ name, businessId: user.businessId }),
      );
    }
    cache.set(cacheKey, flavour);
    return flavour;
  }

  async exportProductsJson(
    tenantDb: DataSource,
    user: { userId: string; businessId: string },
    options?: { isActive?: boolean },
  ) {
    const qb = tenantDb
      .getRepository(Product)
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.subCategory', 'subCategory')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.flavours', 'productFlavours')
      .leftJoinAndSelect('productFlavours.flavour', 'flavour')
      .leftJoinAndSelect('product.pricing', 'pricing')
      .leftJoinAndSelect('pricing.uom', 'uom')
      .where('product.businessId = :businessId', {
        businessId: user.businessId,
      })
      .andWhere('product.isDelete = :isDelete', { isDelete: false })
      .orderBy('product.skuCode', 'ASC');

    if (options?.isActive !== undefined) {
      qb.andWhere('product.isActive = :isActive', {
        isActive: options.isActive,
      });
    }

    const products = await qb.getMany();
    const items = products.map((product) => this.mapProductToJsonItem(product));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_JSON_EXPORTED',
      description: 'Products exported as JSON',
      metadata: {
        businessId: user.businessId,
        count: items.length,
        isActive: options?.isActive ?? null,
      },
    });

    return {
      format: SALESVINCE_EXPORT_FORMAT,
      version: 1,
      entity: JsonExportEntity.PRODUCTS,
      exportedAt: new Date().toISOString(),
      items,
    };
  }

  private async upsertProductFromJsonItem(
    tenantDb: DataSource,
    item: ProductJsonItemDto,
    user: { userId: string; businessId: string },
    mode: JsonImportMode,
    caches: {
      category: Map<string, ProductCategory>;
      subCategory: Map<string, ProductSubCategory>;
      brand: Map<string, ProductBrand>;
      uom: Map<string, Uom>;
      flavour: Map<string, Flavour>;
    },
  ): Promise<JsonImportResultRow & { outcome: 'created' | 'updated' | 'skipped' }> {
    const name = item.name.trim();
    const skuCode = item.skuCode?.trim() || null;
    const barcode = item.barcode?.trim() || null;
    const key = skuCode || name;

    if (!item.category?.name?.trim() || !item.subCategory?.name?.trim()) {
      throw new BadRequestException('category.name and subCategory.name are required');
    }
    if (!item.pricing?.length) {
      throw new BadRequestException('At least one pricing row is required');
    }

    let existing: Product | null = null;
    if (skuCode) {
      existing = await tenantDb.getRepository(Product).findOne({
        where: {
          businessId: user.businessId,
          skuCode,
          isDelete: false,
        },
      });
    }

    if (existing && mode === JsonImportMode.CREATE_ONLY) {
      return {
        index: 0,
        key,
        status: 'skipped',
        message: `Product SKU ${skuCode} already exists`,
        id: existing.id,
        outcome: 'skipped',
      };
    }

    const resolved = await tenantDb.transaction(async (manager) => {
      const category = await this.findOrCreateCategory(
        manager,
        item.category.name.trim(),
        user,
        caches.category,
      );
      const subCategory = await this.findOrCreateSubCategory(
        manager,
        item.subCategory.name.trim(),
        user,
        caches.subCategory,
      );

      let brandId: string | undefined;
      if (item.brand?.name?.trim()) {
        const brand = await this.findOrCreateBrand(
          manager,
          item.brand.name.trim(),
          user,
          caches.brand,
        );
        brandId = brand.id;
      }

      const flavourIds: string[] = [];
      for (const flavourRef of item.flavours ?? []) {
        const flavourName = flavourRef.name?.trim();
        if (!flavourName) {
          continue;
        }
        const flavour = await this.findOrCreateFlavour(
          manager,
          flavourName,
          user,
          caches.flavour,
        );
        flavourIds.push(flavour.id);
      }

      const pricingRows: CreateProductAsyncDto['pricing'] = [];
      for (const price of item.pricing) {
        const uomName = price.uom?.name?.trim();
        if (!uomName) {
          throw new BadRequestException('pricing.uom.name is required');
        }
        const uom = await this.findOrCreateUom(
          manager,
          uomName,
          user,
          caches.uom,
        );
        if (price.isBase === true && !uom.isBase) {
          uom.isBase = true;
          await manager.getRepository(Uom).save(uom);
        }
        const margins = this.resolvePricingMargins(price);
        pricingRows.push(
          this.normalizePricingRow({
            uomId: uom.id,
            pricingType: price.pricingType,
            purchaseUnitPrice: margins.purchaseUnitPrice,
            saleUnitMarginAmount: margins.saleUnitMarginAmount,
            saleUnitMarginPercentage: margins.saleUnitMarginPercentage,
            purchasePercentage: price.purchasePercentage,
            salePercentage: price.salePercentage,
            quantity: margins.quantity,
          }),
        );
      }

      return {
        categoryId: category.id,
        subCategoryId: subCategory.id,
        brandId,
        flavourIds,
        pricingRows,
      };
    });

    if (existing) {
      if (barcode && barcode !== existing.barcode) {
        const barcodeOwner = await tenantDb.getRepository(Product).findOne({
          where: { barcode, isDelete: false },
          select: ['id'],
        });
        if (barcodeOwner && barcodeOwner.id !== existing.id) {
          throw new ConflictException('Product with this barcode already exists');
        }
      }

      await tenantDb.transaction(async (manager) => {
        const productRepo = manager.getRepository(Product);
        const product = await productRepo.findOneOrFail({
          where: { id: existing!.id, isDelete: false },
        });

        product.name = name;
        product.description = item.description?.trim() || null;
        product.hsCode = item.hsCode?.trim() || null;
        product.barcode = barcode;
        product.isActive = item.isActive ?? product.isActive;
        product.batchPickStrategy =
          item.batchPickStrategy ?? product.batchPickStrategy;
        product.categoryId = resolved.categoryId;
        product.subCategoryId = resolved.subCategoryId;
        product.brandId = resolved.brandId ?? null;
        await productRepo.save(product);

        const productFlavourRepo = manager.getRepository(ProductFlavour);
        await productFlavourRepo.delete({ productId: product.id });
        if (resolved.flavourIds.length) {
          await productFlavourRepo.save(
            [...new Set(resolved.flavourIds)].map((flavourId) =>
              productFlavourRepo.create({
                productId: product.id,
                flavourId,
              }),
            ),
          );
        }

        const productPricingRepo = manager.getRepository(ProductPricing);
        await productPricingRepo.delete({ productId: product.id });
        await productPricingRepo.save(
          resolved.pricingRows.map((price) =>
            productPricingRepo.create({
              productId: product.id,
              ...price,
            }),
          ),
        );
      });

      return {
        index: 0,
        key,
        status: 'updated',
        id: existing.id,
        outcome: 'updated',
      };
    }

    const createDto: CreateProductAsyncDto = {
      categoryId: resolved.categoryId,
      subCategoryId: resolved.subCategoryId,
      brandId: resolved.brandId,
      skuCode: skuCode ?? undefined,
      barcode: barcode,
      name,
      description: item.description?.trim() || undefined,
      hsCode: item.hsCode?.trim() || undefined,
      isActive: item.isActive ?? true,
      batchPickStrategy: item.batchPickStrategy ?? BatchPickStrategy.LIFO,
      flavourIds: resolved.flavourIds.length ? resolved.flavourIds : undefined,
      pricing: resolved.pricingRows,
    };

    if (barcode) {
      await this.ensureBarcodeUnique(tenantDb, barcode);
    }

    const created = await this.createWithImageUrl(
      tenantDb,
      createDto,
      null,
      user,
    );

    return {
      index: 0,
      key: created.skuCode,
      status: 'created',
      id: created.id,
      outcome: 'created',
    };
  }

  private sanitizeJsonEmptyStrings(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJsonEmptyStrings(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        out[key] =
          nested === '' ? null : this.sanitizeJsonEmptyStrings(nested);
      }
      return out;
    }
    return value;
  }

  private formatValidationErrors(errors: ReturnType<typeof validateSync>): string {
    const walk = (list: typeof errors, prefix = ''): string[] => {
      const messages: string[] = [];
      for (const error of list) {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        messages.push(...Object.values(error.constraints ?? {}).map((msg) => `${path}: ${msg}`));
        if (error.children?.length) {
          messages.push(...walk(error.children, path));
        }
      }
      return messages;
    };
    return walk(errors).join('; ');
  }

  private parseProductJsonImportFile(file: Express.Multer.File): ProductJsonImportDto {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'JSON file is required. Use multipart form-data field "file".',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON file');
    }

    const dto = plainToInstance(
      ProductJsonImportDto,
      this.sanitizeJsonEmptyStrings(parsed),
      { enableImplicitConversion: true },
    );
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length) {
      throw new BadRequestException(
        this.formatValidationErrors(errors) ||
          'Invalid product JSON import payload',
      );
    }

    if (dto.entity && dto.entity !== JsonExportEntity.PRODUCTS) {
      throw new BadRequestException(
        'entity must be "products" for product JSON import',
      );
    }

    return dto;
  }

  private resolveJsonImportMode(
    fileMode: JsonImportMode | undefined,
    bodyMode?: string,
  ): JsonImportMode {
    const raw = bodyMode?.trim() || fileMode;
    if (!raw) {
      return JsonImportMode.UPSERT;
    }
    if (raw === JsonImportMode.UPSERT || raw === JsonImportMode.CREATE_ONLY) {
      return raw;
    }
    throw new BadRequestException('mode must be upsert or createOnly');
  }

  private async notifyProductJsonImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Product JSON import completed'
        : 'Product JSON import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        businessId: user.businessId,
        message,
        type: 'product_json_import',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
      },
    );
  }

  private async processProductJsonImportJob(
    tenantDb: DataSource,
    jobId: string,
    items: ProductJsonItemDto[],
    mode: JsonImportMode,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const caches = {
      category: new Map<string, ProductCategory>(),
      subCategory: new Map<string, ProductSubCategory>(),
      brand: new Map<string, ProductBrand>(),
      uom: new Map<string, Uom>(),
      flavour: new Map<string, Flavour>(),
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [index, item] of items.entries()) {
      const key = item.skuCode?.trim() || item.name.trim();
      try {
        const row = await this.upsertProductFromJsonItem(
          tenantDb,
          item,
          user,
          mode,
          caches,
        );

        if (row.outcome === 'skipped') {
          skipped += 1;
          this.tenantJobService.appendLog(jobId, {
            row: index + 1,
            name: key,
            status: 'error',
            error: row.message || 'Already exists',
            metadata: { outcome: 'skipped', productId: row.id },
          });
          continue;
        }

        if (row.outcome === 'created') created += 1;
        else updated += 1;

        this.tenantJobService.appendLog(jobId, {
          row: index + 1,
          name: row.key,
          status: 'success',
          metadata: {
            outcome: row.outcome,
            productId: row.id,
            skuCode: row.key,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: index + 1,
          name: key,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Product JSON import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        created,
        updated,
        skipped,
        mode,
      },
    });

    await this.notifyProductJsonImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importProductsJson(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
    bodyMode?: string,
  ) {
    const dto = this.parseProductJsonImportFile(file);
    const mode = this.resolveJsonImportMode(dto.options?.mode, bodyMode);

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PRODUCT_JSON_IMPORT',
      fileName: file.originalname || 'products.json',
      createdBy: user.userId,
      totalRows: dto.items.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Product JSON import started for ${job.fileName}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: job.fileName,
        totalRows: job.totalRows,
        mode,
      },
    });

    void this.processProductJsonImportJob(
      tenantDb,
      job.id,
      dto.items,
      mode,
      user,
      tenantCode,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing failure',
      });
      const failedJob = this.tenantJobService.getJobById(
        job.id,
        tenantCode,
        user.userId,
      );

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_FAILED',
        description: `Product JSON import failed for ${job.fileName}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: job.fileName,
          error: error instanceof Error ? error.message : String(error),
          mode,
        },
      });
      await this.notifyProductJsonImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Product JSON import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
      mode,
    };
  }
}
