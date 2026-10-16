import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { ProductSubCategory } from 'src/tenant-db/entities/product.entity';
import { ensureChartOfAccountForSubCategory } from 'src/tenant-db/helpers/product-chart-of-account.helper';
import { ActivityLogService } from './activity-log.service';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';
import { CreateProductSubCategoryDto } from '../dto/product-sub-category/create-product-sub-category.dto';
import { UpdateProductSubCategoryDto } from '../dto/product-sub-category/update-product-sub-category.dto';

@Injectable()
export class ProductSubCategoryService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private sanitizeText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private parseSubCategoryRowsFromFile(
    file: Express.Multer.File,
  ): Array<{ row: number; name: string; slug: string }> {
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
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    const subCategories: Array<{ row: number; name: string; slug: string }> = [];

    rows.forEach((row, index) => {
      if (!row?.length) {
        return;
      }
      const name = this.sanitizeText(String(row[0] ?? ''));
      if (!name || name.toLowerCase() === 'name') {
        return;
      }
      const slug = this.slugify(name);
      if (!slug) {
        return;
      }
      subCategories.push({ row: index + 1, name, slug });
    });

    return subCategories;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Product sub category import completed'
        : 'Product sub category import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        businessId: user.businessId,
        title,
        message,
        type: 'product_sub_category_import',
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

  private async processImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: Array<{ row: number; name: string; slug: string }>,
    user: any,
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const subCategoryRepo = tenantDb.getRepository(ProductSubCategory);

    for (const row of rows) {
      try {
        const exists = await subCategoryRepo.findOne({
          where: {
            slug: row.slug,
            businessId: user.businessId,
          },
        });
        if (exists) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const created = await tenantDb.transaction(async (manager) => {
          const subCategory = await manager.getRepository(ProductSubCategory).save(
            manager.getRepository(ProductSubCategory).create({
              name: row.name,
              slug: row.slug,
              categoryId: null,
              businessId: user.businessId,
            }),
          );
          await ensureChartOfAccountForSubCategory(manager, subCategory);
          return subCategory;
        });

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: {
            productSubCategoryId: created.id,
            slug: created.slug,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
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
      description: `Product sub category import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyImportCompletion(tenantDb, completedJob, user, tenantCode, 'completed');
  }

  async create(
    tenantDb: DataSource,
    dto: CreateProductSubCategoryDto,
    user: any,
  ) {
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    const subCategoryRepo = tenantDb.getRepository(ProductSubCategory);
    const existingSubCategory = await subCategoryRepo.findOne({
      where: { slug, businessId: user.businessId },
    });

    if (existingSubCategory) {
      throw new ConflictException(
        'Product sub category with this slug already exists',
      );
    }

    const createdSubCategory = await tenantDb.transaction(async (manager) => {
      const subCategory = await manager.getRepository(ProductSubCategory).save(
        manager.getRepository(ProductSubCategory).create({
          name,
          slug,
          categoryId: null,
          businessId: user.businessId,
        }),
      );
      await ensureChartOfAccountForSubCategory(manager, subCategory);
      return manager.getRepository(ProductSubCategory).findOneOrFail({
        where: { id: subCategory.id },
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_SUB_CATEGORY_CREATED',
      description: `Product sub category ${createdSubCategory.name} created`,
      metadata: {
        productSubCategoryId: createdSubCategory.id,
        businessId: createdSubCategory.businessId,
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
    user: any,
  ) {
    const subCategoryRepo = tenantDb.getRepository(ProductSubCategory);
    const where: Array<Record<string, unknown>> = [
      { name: Like(`%${search}%`), businessId: user.businessId },
      { slug: Like(`%${search}%`), businessId: user.businessId },
    ];

    const [subCategories, total] = await subCategoryRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'PRODUCT_SUB_CATEGORY_LISTED',
      description: 'Product sub categories listed',
      metadata: { total, page, limit },
    });

    return { result: subCategories, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const subCategory = await tenantDb.getRepository(ProductSubCategory).findOne({
      where: { id, businessId: user.businessId },
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

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== subCategory.slug) {
        const slugTaken = await subCategoryRepo.findOne({
          where: { slug: nextSlug, businessId: user.businessId },
        });
        if (slugTaken && slugTaken.id !== subCategory.id) {
          throw new ConflictException(
            'Product sub category with this slug already exists',
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
        slug: subCategory.slug,
      },
    });

    return subCategoryRepo.findOne({
      where: { id },
    });
  }

  async importSubCategories(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: any,
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseSubCategoryRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException(
        'No sub categories found in file. Expected column: sub category name',
      );
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PRODUCT_SUB_CATEGORY_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Product sub category import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processImportJob(tenantDb, job.id, rows, user, tenantCode).catch(
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
          description: `Product sub category import failed for ${file.originalname}`,
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            fileName: file.originalname,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        await this.notifyImportCompletion(tenantDb, failedJob, user, tenantCode, 'failed');
      },
    );

    return {
      message: 'Product sub category import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
