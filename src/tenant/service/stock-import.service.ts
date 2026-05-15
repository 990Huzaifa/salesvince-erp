import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { ImportStockDto } from '../dto/stock/import-stock.dto';
import { CreateOpeningStockDto } from '../dto/opening-stock/create-opening-stock.dto';
import { CreatePurchaseStockDto } from '../dto/purchase-stock/create-purchase-stock.dto';
import { OpeningStockService } from './opening-stock.service';
import { PurchaseStockService } from './purchase-stock.service';
import { ActivityLogService } from './activity-log.service';
import { NotificationService } from './notification.service';
import { TenantJob, TenantJobService } from './tenant-job.service';
import { ProductFlavour, ProductPricing } from 'src/tenant-db/entities/product.entity';

type ParsedStockRow = {
  row: number;
  productId: string;
  productFlavourId: string;
  productPricingId: string;
  quantity: number;
};

@Injectable()
export class StockImportService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
    private readonly openingStockService: OpeningStockService,
    private readonly purchaseStockService: PurchaseStockService,
  ) {}

  private ensureCsvFile(file: Express.Multer.File): void {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || extension !== 'csv') {
      throw new BadRequestException('Only CSV files are supported');
    }
  }

  private findColumnIndex(headers: string[], acceptedNames: string[]): number {
    return headers.findIndex((header) => acceptedNames.includes(header));
  }

  private parseCsvRows(file: Express.Multer.File): ParsedStockRow[] {
    this.ensureCsvFile(file);

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('CSV file is empty');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    if (!rows.length) {
      throw new BadRequestException('CSV file is empty');
    }

    const headers = (rows[0] ?? []).map((value) => String(value ?? '').trim().toLowerCase());
    const productIdIndex = this.findColumnIndex(headers, ['productid', 'product_id']);
    const productFlavourIdIndex = this.findColumnIndex(headers, [
      'productflavourid',
      'product_flavour_id',
    ]);
    const productPricingIdIndex = this.findColumnIndex(headers, [
      'productpricingid',
      'product_pricing_id',
    ]);
    const quantityIndex = this.findColumnIndex(headers, ['quantity', 'qty']);

    if (
      productIdIndex < 0 ||
      productFlavourIdIndex < 0 ||
      productPricingIdIndex < 0 ||
      quantityIndex < 0
    ) {
      throw new BadRequestException(
        'CSV must contain headers: productId, productFlavourId, productPricingId, quantity',
      );
    }

    const parsedRows: ParsedStockRow[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] ?? [];
      const productId = String(row[productIdIndex] ?? '').trim();
      const productFlavourId = String(row[productFlavourIdIndex] ?? '').trim();
      const productPricingId = String(row[productPricingIdIndex] ?? '').trim();
      const quantityRaw = String(row[quantityIndex] ?? '').trim();

      if (!productId && !productFlavourId && !productPricingId && !quantityRaw) {
        continue;
      }

      const quantity = Number(quantityRaw);
      if (!productId || !productFlavourId || !productPricingId || !Number.isFinite(quantity)) {
        throw new BadRequestException(`Invalid data at CSV row ${i + 1}`);
      }

      if (quantity <= 0) {
        throw new BadRequestException(`Quantity must be greater than 0 at CSV row ${i + 1}`);
      }

      parsedRows.push({
        row: i + 1,
        productId,
        productFlavourId,
        productPricingId,
        quantity,
      });
    }

    if (!parsedRows.length) {
      throw new BadRequestException('No valid stock rows found in file');
    }

    return parsedRows;
  }

  private async notifyImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title = status === 'completed' ? 'Stock import completed' : 'Stock import failed';
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
        type: 'stock_import',
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

  private async validateRows(
    tenantDb: DataSource,
    rows: ParsedStockRow[],
  ): Promise<{
    validRows: ParsedStockRow[];
    invalidLogs: Array<{ row: number; name: string; status: 'error'; error: string }>;
  }> {
    const flavourRepo = tenantDb.getRepository(ProductFlavour);
    const pricingRepo = tenantDb.getRepository(ProductPricing);

    const validRows: ParsedStockRow[] = [];
    const invalidLogs: Array<{ row: number; name: string; status: 'error'; error: string }> = [];

    for (const row of rows) {
      const flavour = await flavourRepo.findOne({
        where: { id: row.productFlavourId, productId: row.productId },
        select: ['id'],
      });
      if (!flavour) {
        invalidLogs.push({
          row: row.row,
          name: row.productId,
          status: 'error',
          error: `Product flavour ${row.productFlavourId} is not valid for product ${row.productId}`,
        });
        continue;
      }

      const pricing = await pricingRepo.findOne({
        where: { id: row.productPricingId, productId: row.productId },
        select: ['id'],
      });
      if (!pricing) {
        invalidLogs.push({
          row: row.row,
          name: row.productId,
          status: 'error',
          error: `Product pricing ${row.productPricingId} is not valid for product ${row.productId}`,
        });
        continue;
      }

      validRows.push(row);
    }

    return { validRows, invalidLogs };
  }

  private async processImportJob(
    tenantDb: DataSource,
    jobId: string,
    dto: ImportStockDto,
    rows: ParsedStockRow[],
    fileName: string,
    user: { userId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const { validRows, invalidLogs } = await this.validateRows(tenantDb, rows);
    for (const log of invalidLogs) {
      this.tenantJobService.appendLog(jobId, log);
    }

    if (validRows.length > 0) {
      if (dto.type === 'OPENING') {
        const payload: CreateOpeningStockDto = {
          distributorId: dto.distributorId,
          date: dto.date,
          remarks: `Imported via CSV: ${fileName}`,
          items: validRows.map((row) => ({
            productId: row.productId,
            productFlavourId: Number(row.productFlavourId),
            productPricingId: row.productPricingId,
            quantity: row.quantity,
          })),
        };
        await this.openingStockService.create(tenantDb, payload, user);
      } else {
        const payload: CreatePurchaseStockDto = {
          distributorId: dto.distributorId,
          date: dto.date,
          remarks: `Imported via CSV: ${fileName}`,
          items: validRows.map((row) => ({
            productId: row.productId,
            productFlavourId: Number(row.productFlavourId),
            productPricingId: row.productPricingId,
            quantity: row.quantity,
          })),
        };
        await this.purchaseStockService.create(tenantDb, payload, user);
      }

      for (const row of validRows) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.productId,
          status: 'success',
          metadata: {
            type: dto.type,
            productFlavourId: row.productFlavourId,
            productPricingId: row.productPricingId,
            quantity: row.quantity,
          },
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Stock import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        stockType: dto.type,
      },
    });
    await this.notifyImportCompletion(tenantDb, completedJob, user, tenantCode, 'completed');
  }

  async importStock(
    tenantDb: DataSource,
    dto: ImportStockDto,
    file: Express.Multer.File,
    user: { userId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseCsvRows(file);
    const job = this.tenantJobService.createJob({
      tenantCode,
      jobType: `STOCK_IMPORT_${dto.type}`,
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'TENANT_JOB_STARTED',
      description: `Stock import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
        stockType: dto.type,
      },
    });

    void this.processImportJob(tenantDb, job.id, dto, rows, file.originalname, user, tenantCode).catch(
      async (error) => {
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
          description: `Stock import failed for ${file.originalname}`,
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            fileName: file.originalname,
            error: error instanceof Error ? error.message : String(error),
            stockType: dto.type,
          },
        });
        await this.notifyImportCompletion(tenantDb, failedJob, user, tenantCode, 'failed');
      },
    );

    return {
      message: 'Stock import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
