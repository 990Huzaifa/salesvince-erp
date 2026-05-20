import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { Uom } from 'src/tenant-db/entities/product.entity';
import { ActivityLogService } from './activity-log.service';
import { CreateUomDto } from '../dto/uom/create-uom.dto';
import { UpdateUomDto } from '../dto/uom/update-uom.dto';
import * as XLSX from 'xlsx';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';

@Injectable()
export class UomService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private sanitizeUomName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  private parseUomNamesFromFile(file: Express.Multer.File): Array<{ row: number; name: string }> {
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

    const uomNames: Array<{ row: number; name: string }> = [];
    rows.forEach((row, index) => {
      if (!row?.length) {
        return;
      }
      const firstColumnValue = row[0];
      const normalizedName = this.sanitizeUomName(String(firstColumnValue ?? ''));
      if (!normalizedName || normalizedName.toLowerCase() === 'name') {
        return;
      }
      uomNames.push({ row: index + 1, name: normalizedName });
    });

    return uomNames;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: any,
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title = status === 'completed' ? 'UOM import completed' : 'UOM import failed';
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
        type: 'uom_import',
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
    rows: Array<{ row: number; name: string }>,
    user: any,
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const uomRepo = tenantDb.getRepository(Uom);
    for (const row of rows) {
      try {
        const exists = await uomRepo.findOne({ where: { name: row.name, businessId: user.businessId } });
        if (exists) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const created = await uomRepo.save(uomRepo.create({ name: row.name, businessId: user.businessId, isBase: false }));
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: { uomId: created.id },
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
      description: `UOM import completed for ${completedJob.fileName}`,
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

  async create(tenantDb: DataSource, dto: CreateUomDto, user: any) {
    const name = dto.name.trim();
    const uomRepo = tenantDb.getRepository(Uom);

    const existingUom = await uomRepo.findOne({
      where: { name, businessId: user.businessId },
    });

    if (existingUom) {
      throw new ConflictException('UOM with this name already exists');
    }



    const createdUom = await uomRepo.save(
      uomRepo.create({
        name,
        businessId: user.businessId,
        isBase: false,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'UOM_CREATED',
      description: `UOM ${createdUom.name} created`,
      metadata: { uomId: createdUom.id, businessId: createdUom.businessId, isBase: createdUom.isBase },
    });

    return createdUom;
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const [uoms, total] = await tenantDb.getRepository(Uom).findAndCount({
      where: { name: Like(`%${search}%`), businessId: user.businessId, isBase: false },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'UOM_LISTED',
      description: 'UOM listed',
      metadata: { total, page, limit },
    });

    return { result: uoms, meta: { total, page, limit } };
  }

  async view(tenantDb: DataSource, id: string, user: any) {
    const uom = await tenantDb.getRepository(Uom).findOne({
      where: { id, businessId: user.businessId },
    });

    if (!uom) {
      throw new NotFoundException('UOM not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'UOM_VIEWED',
      description: `UOM ${uom.name} viewed`,
      metadata: { uomId: uom.id },
    });

    return uom;
  }

  async edit(tenantDb: DataSource, id: string, dto: UpdateUomDto, user: any) {
    const uomRepo = tenantDb.getRepository(Uom);
    const uom = await uomRepo.findOne({ where: { id, businessId: user.businessId } });

    if (!uom) {
      throw new NotFoundException('UOM not found');
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (nextName !== uom.name) {
        const nameTaken = await uomRepo.findOne({ where: { name: nextName, businessId: user.businessId } });
        if (nameTaken) {
          throw new ConflictException('UOM with this name already exists');
        }
        uom.name = nextName;
      }
    }

    await uomRepo.save(uom);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'UOM_UPDATED',
      description: `UOM ${uom.name} updated`,
      metadata: { uomId: uom.id, businessId: uom.businessId, isBase: uom.isBase },
    });

    return uom;
  }

  async importUoms(tenantDb: DataSource, file: Express.Multer.File, user: any, tenantCode: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseUomNamesFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No UOM names found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'UOM_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `UOM import started for ${file.originalname}`,
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
        businessId: user.businessId,
        action: 'TENANT_JOB_FAILED',
        description: `UOM import failed for ${file.originalname}`,
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
      message: 'UOM import started',
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
