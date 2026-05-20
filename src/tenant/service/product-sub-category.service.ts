import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import {
  ProductCategory,
  ProductSubCategory,
} from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateProductSubCategoryDto } from '../dto/product-sub-category/create-product-sub-category.dto';
import { UpdateProductSubCategoryDto } from '../dto/product-sub-category/update-product-sub-category.dto';

@Injectable()
export class ProductSubCategoryService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private async ensureCategoryExists(tenantDb: DataSource, categoryId: string, user: any) {
    const category = await tenantDb.getRepository(ProductCategory).findOne({
      where: { id: categoryId, businessId: user.businessId },
      select: ['id'],
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }
  }

  async create(
    tenantDb: DataSource,
    dto: CreateProductSubCategoryDto,
    user: any,
  ) {
    const categoryId = dto.categoryId.trim();
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    await this.ensureCategoryExists(tenantDb, categoryId, user);

    const subCategoryRepo = tenantDb.getRepository(ProductSubCategory);
    const existingSubCategory = await subCategoryRepo.findOne({
      where: { categoryId, slug, businessId: user.businessId },
    });

    if (existingSubCategory) {
      throw new ConflictException(
        'Product sub category with this slug already exists for the category',
      );
    }

    const subCategory = subCategoryRepo.create({
      name,
      slug,
      categoryId,
      businessId: user.businessId,
    });

    const createdSubCategory = await subCategoryRepo.save(subCategory);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_SUB_CATEGORY_CREATED',
      description: `Product sub category ${createdSubCategory.name} created`,
      metadata: {
        productSubCategoryId: createdSubCategory.id,
        businessId: createdSubCategory.businessId,
        categoryId: createdSubCategory.categoryId,
        slug: createdSubCategory.slug,
      },
    });

    return createdSubCategory;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    categoryId: string | undefined,
    user: any,
  ) {
    const subCategoryRepo = tenantDb.getRepository(ProductSubCategory);
    const where: Array<Record<string, unknown>> = [
      { name: Like(`%${search}%`), businessId: user.businessId },
      { slug: Like(`%${search}%`), businessId: user.businessId },
    ];

    if (categoryId?.trim()) {
      const trimmedCategoryId = categoryId.trim();
      where.forEach((condition) => {
        condition.categoryId = trimmedCategoryId;
      });
    }

    const [subCategories, total] = await subCategoryRepo.findAndCount({
      where,
      relations: ['category'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_SUB_CATEGORY_LISTED',
      description: 'Product sub categories listed',
      metadata: { total, page, limit, categoryId: categoryId?.trim() || null },
    });

    return { result: subCategories, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const subCategory = await tenantDb.getRepository(ProductSubCategory).findOne({
      where: { id, businessId: user.businessId },
      relations: ['category'],
    });

    if (!subCategory) {
      throw new NotFoundException('Product sub category not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_SUB_CATEGORY_VIEWED',
      description: `Product sub category ${subCategory.name} viewed`,
      metadata: { productSubCategoryId: subCategory.id },
    });

    return subCategory;
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateProductSubCategoryDto,
    user: any,
  ) {
    const subCategoryRepo = tenantDb.getRepository(ProductSubCategory);
    const subCategory = await subCategoryRepo.findOne({
      where: { id, businessId: user.businessId },
    });

    if (!subCategory) {
      throw new NotFoundException('Product sub category not found');
    }

    if (dto.categoryId !== undefined) {
      const nextCategoryId = dto.categoryId.trim();
      if (nextCategoryId !== subCategory.categoryId) {
        await this.ensureCategoryExists(tenantDb, nextCategoryId, user);
        subCategory.categoryId = nextCategoryId;
      }
    }

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== subCategory.slug) {
        const slugTaken = await subCategoryRepo.findOne({
          where: { categoryId: subCategory.categoryId, slug: nextSlug, businessId: user.businessId },
        });
        if (slugTaken && slugTaken.id !== subCategory.id) {
          throw new ConflictException(
            'Product sub category with this slug already exists for the category',
          );
        }
        subCategory.slug = nextSlug;
      }
    }

    if (dto.name !== undefined) {
      subCategory.name = dto.name.trim();
    }

    await subCategoryRepo.save(subCategory);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_SUB_CATEGORY_UPDATED',
      description: `Product sub category ${subCategory.name} updated`,
      metadata: {
        productSubCategoryId: subCategory.id,
        businessId: subCategory.businessId,
        categoryId: subCategory.categoryId,
        slug: subCategory.slug,
      },
    });

    return subCategoryRepo.findOne({
      where: { id },
      relations: ['category'],
    });
  }
}
