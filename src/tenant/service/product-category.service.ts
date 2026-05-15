import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { ProductCategory } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateProductCategoryDto } from '../dto/product-category/create-product-category.dto';
import { UpdateProductCategoryDto } from '../dto/product-category/update-product-category.dto';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

@Injectable()
export class ProductCategoryService {
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

  private parseCategoryRowsFromFile(
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

    const categories: Array<{ row: number; name: string; slug: string }> = [];
    rows.forEach((row, index) => {
      if (!row?.length) {
        return;
      }
      const firstColumnValue = this.sanitizeText(String(row[0] ?? ''));
      if (!firstColumnValue || firstColumnValue.toLowerCase() === 'name') {
        return;
      }
      const slug = this.slugify(firstColumnValue);
      if (!slug) {
        return;
      }
      categories.push({ row: index + 1, name: firstColumnValue, slug });
    });

    return categories;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed' ? 'Product category import completed' : 'Product category import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        message,
        type: 'product_category_import',
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
    const job = this.tenantJobService.startJob(jobId);
    const categoryRepo = tenantDb.getRepository(ProductCategory);

    for (const row of rows) {
      try {
        const exists = await categoryRepo.findOne({ where: [{ slug: row.slug }, { name: row.name }] });
        if (exists) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const created = await categoryRepo.save(
          categoryRepo.create({
            name: row.name,
            slug: row.slug,
            createdBy: user.userId,
          }),
        );

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: { categoryId: created.id, slug: created.slug },
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
      action: 'TENANT_JOB_COMPLETED',
      description: `Product category import completed for ${completedJob.fileName}`,
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
    dto: CreateProductCategoryDto,
    user: any,
  ) {
    const slug = dto.slug.trim().toLowerCase();
    const existingCategory = await tenantDb.getRepository(ProductCategory).findOne({
      where: { slug },
    });

    if (existingCategory) {
      throw new ConflictException('Product category with this slug already exists');
    }

    const category = tenantDb.getRepository(ProductCategory).create({
      name: dto.name.trim(),
      slug,
      createdBy: user.userId,
    });

    const createdCategory = await tenantDb.getRepository(ProductCategory).save(category);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_CREATED',
      description: `Product category ${createdCategory.name} created`,
      metadata: { productCategoryId: createdCategory.id, slug: createdCategory.slug },
    });

    return createdCategory;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [categories, total] = await tenantDb.getRepository(ProductCategory).findAndCount({
      where: [
        { name: Like(`%${search}%`) },
        { slug: Like(`%${search}%`) },
      ],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_LISTED',
      description: 'Product categories listed',
      metadata: { total, page, limit },
    });

    return { result: categories, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const category = await tenantDb.getRepository(ProductCategory).findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_VIEWED',
      description: `Product category ${category.name} viewed`,
      metadata: { productCategoryId: category.id },
    });

    return category;
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateProductCategoryDto,
    user: any,
  ) {
    const categoryRepo = tenantDb.getRepository(ProductCategory);
    const category = await categoryRepo.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }

    if (dto.slug !== undefined) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== category.slug) {
        const slugTaken = await categoryRepo.findOne({ where: { slug: nextSlug } });
        if (slugTaken) {
          throw new ConflictException('Product category with this slug already exists');
        }
        category.slug = nextSlug;
      }
    }

    if (dto.name !== undefined) {
      category.name = dto.name.trim();
    }

    await categoryRepo.save(category);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_CATEGORY_UPDATED',
      description: `Product category ${category.name} updated`,
      metadata: { productCategoryId: category.id, slug: category.slug },
    });

    return category;
  }

  async importCategories(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: any,
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseCategoryRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No category names found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'PRODUCT_CATEGORY_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Product category import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processImportJob(tenantDb, job.id, rows, user, tenantCode).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing failure',
      });

      const failedJob = this.tenantJobService.getJobById(job.id, tenantCode, user.userId);
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'TENANT_JOB_FAILED',
        description: `Product category import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });

      await this.notifyImportCompletion(tenantDb, failedJob, user, tenantCode, 'failed');
    });

    return {
      message: 'Product category import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
