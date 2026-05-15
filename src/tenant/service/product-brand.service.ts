import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { ProductBrand } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateProductBrandDto } from '../dto/product-brand/create-product-brand.dto';
import { UpdateProductBrandDto } from '../dto/product-brand/update-product-brand.dto';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

@Injectable()
export class ProductBrandService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private sanitizeBrandName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  private parseBrandNamesFromFile(file: Express.Multer.File): Array<{ row: number; name: string }> {
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

    const brandNames: Array<{ row: number; name: string }> = [];
    rows.forEach((row, index) => {
      if (!row?.length) {
        return;
      }
      const firstColumnValue = row[0];
      const normalizedName = this.sanitizeBrandName(String(firstColumnValue ?? ''));
      if (!normalizedName || normalizedName.toLowerCase() === 'name') {
        return;
      }
      brandNames.push({ row: index + 1, name: normalizedName });
    });

    return brandNames;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed' ? 'Product brand import completed' : 'Product brand import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(tenantDb, {
      userId: user.userId,
      title,
      message,
      type: 'product_brand_import',
    }, tenantCode, {
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
    });
  }

  private async processImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: Array<{ row: number; name: string }>,
    user: any,
    tenantCode: string,
  ) {
    const job = this.tenantJobService.startJob(jobId);

    const brandRepo = tenantDb.getRepository(ProductBrand);
    for (const row of rows) {
      try {
        const exists = await brandRepo.findOne({ where: { name: row.name } });
        if (exists) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const created = await brandRepo.save(brandRepo.create({ name: row.name }));
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: { brandId: created.id },
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
      description: `Product brand import completed for ${completedJob.fileName}`,
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

  async create(tenantDb: DataSource, dto: CreateProductBrandDto, user: any) {
    const name = dto.name.trim();
    const existingBrand = await tenantDb.getRepository(ProductBrand).findOne({
      where: { name },
    });

    if (existingBrand) {
      throw new ConflictException('Product brand with this name already exists');
    }

    const brand = tenantDb.getRepository(ProductBrand).create({ name });
    const createdBrand = await tenantDb.getRepository(ProductBrand).save(brand);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_CREATED',
      description: `Product brand ${createdBrand.name} created`,
      metadata: { productBrandId: createdBrand.id },
    });

    return createdBrand;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [brands, total] = await tenantDb.getRepository(ProductBrand).findAndCount({
      where: { name: Like(`%${search}%`) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_LISTED',
      description: 'Product brands listed',
      metadata: { total, page, limit },
    });

    return { result: brands, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const brand = await tenantDb.getRepository(ProductBrand).findOne({
      where: { id },
    });

    if (!brand) {
      throw new NotFoundException('Product brand not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_VIEWED',
      description: `Product brand ${brand.name} viewed`,
      metadata: { productBrandId: brand.id },
    });

    return brand;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateProductBrandDto, user: any) {
    const brandRepo = tenantDb.getRepository(ProductBrand);
    const brand = await brandRepo.findOne({ where: { id } });

    if (!brand) {
      throw new NotFoundException('Product brand not found');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== brand.name) {
        const nameTaken = await brandRepo.findOne({ where: { name: nextName } });
        if (nameTaken) {
          throw new ConflictException('Product brand with this name already exists');
        }
        brand.name = nextName;
      }
    }

    await brandRepo.save(brand);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'PRODUCT_BRAND_UPDATED',
      description: `Product brand ${brand.name} updated`,
      metadata: { productBrandId: brand.id },
    });

    return brand;
  }

  async importBrands(tenantDb: DataSource, file: Express.Multer.File, user: any, tenantCode: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseBrandNamesFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No brand names found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: 'PRODUCT_BRAND_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Product brand import started for ${file.originalname}`,
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
        description: `Product brand import failed for ${file.originalname}`,
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
      message: 'Product brand import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }

  getImportJobStatus(jobId: string, user: any, tenantCode: string) {
    return this.tenantJobService.getJobById(jobId, tenantCode, user.userId);
  }

  getMyImportJobs(user: any, tenantCode: string) {
    return this.tenantJobService.listJobsForUser(tenantCode, user.userId);
  }
}
