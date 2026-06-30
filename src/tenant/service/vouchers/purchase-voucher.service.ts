import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import * as XLSX from 'xlsx';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { PaymentMethod } from 'src/tenant-db/entities/voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import { VoucherOperationsService } from './voucher-operations.service';
import { PURCHASE_VOUCHER_CONFIG } from './voucher-configs';
import { VoucherListOptions } from './voucher.types';
import {
  CreatePurchaseVoucherItemDto,
  UpdatePurchaseVoucherDto,
} from '../../dto/voucher/purchase-voucher.dto';

type PurchaseVoucherImportRow = {
  row: number;
  voucherNumber: string;
  vendorName: string;
  paymentDate: string;
  paymentAmount: number;
  paymentMethod: string;
  accountName: string;
  transactionType: string;
  chequeNumber: string;
  chequeDate: string;
  remarks: string;
};

@Injectable()
export class PurchaseVoucherService {
  constructor(
    private readonly voucherOps: VoucherOperationsService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  create(
    tenantDb: DataSource,
    businessId: string,
    items: CreatePurchaseVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.create(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      items,
      userId,
    );
  }

  createAndApprove(
    tenantDb: DataSource,
    businessId: string,
    items: CreatePurchaseVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.createAndApprove(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      items,
      userId,
    );
  }

  list(
    tenantDb: DataSource,
    businessId: string,
    options: VoucherListOptions,
    userId: string,
  ) {
    return this.voucherOps.list(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      options,
      userId,
    );
  }

  getById(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.getById(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  edit(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    dto: UpdatePurchaseVoucherDto,
    userId: string,
  ) {
    return this.voucherOps.edit(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      id,
      dto,
      userId,
    );
  }

  approve(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.approve(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  cancel(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.cancel(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  private roundAmount(value: number): number {
    return Math.round(Number(value) * 100) / 100;
  }

  private sanitizeImportText(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value ?? '').trim();
    }
    return value.trim();
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

  private parseImportNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private resolveImportedPaymentMethod(
    paymentMethod: string,
    transactionType?: string,
  ): PaymentMethod {
    const method = paymentMethod.trim().toUpperCase();
    const txn = transactionType?.trim().toUpperCase() ?? '';

    if (method === 'CHEQUE') {
      return PaymentMethod.CHEQUE;
    }
    if (method === 'CASH') {
      return PaymentMethod.CASH;
    }
    if (method === 'ONLINE' || txn === 'ONLINE') {
      return PaymentMethod.ONLINE;
    }
    if (method === 'TRANSFER' || txn === 'TRANSFER') {
      return PaymentMethod.TRANSFER;
    }
    if (method === 'OTHER') {
      return PaymentMethod.OTHER;
    }
    if (method === 'BANK') {
      if (txn === 'ONLINE') {
        return PaymentMethod.ONLINE;
      }
      if (txn === 'TRANSFER') {
        return PaymentMethod.TRANSFER;
      }
      return PaymentMethod.ONLINE;
    }

    const enumValues = Object.values(PaymentMethod) as string[];
    if (enumValues.includes(method)) {
      return method as PaymentMethod;
    }

    throw new BadRequestException(`Unsupported payment method: ${paymentMethod}`);
  }

  private parsePurchaseVoucherRowsFromFile(
    file: Express.Multer.File,
  ): PurchaseVoucherImportRow[] {
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

    const rows: PurchaseVoucherImportRow[] = [];

    rawRows.forEach((row, index) => {
      const voucherNumber = this.sanitizeImportText(
        this.getImportRowValue(row, 'code', 'voucherNumber', 'vouchernumber'),
      );
      if (!voucherNumber || voucherNumber.toLowerCase() === 'code') {
        return;
      }

      rows.push({
        row: index + 2,
        voucherNumber,
        vendorName: this.sanitizeImportText(
          this.getImportRowValue(row, 'vendorName', 'vendor', 'vendorname'),
        ),
        paymentDate: this.sanitizeImportText(
          this.getImportRowValue(
            row,
            'voucherDate',
            'voucherdate',
            'paymentDate',
            'paymentdate',
          ),
        ),
        paymentAmount:
          this.parseImportNumber(
            this.getImportRowValue(row, 'amount', 'paymentAmount', 'paymentamount'),
          ) ?? 0,
        paymentMethod: this.sanitizeImportText(
          this.getImportRowValue(row, 'paymentMethod', 'paymentmethod'),
        ),
        accountName: this.sanitizeImportText(
          this.getImportRowValue(
            row,
            'accountName',
            'accountname',
            'bankAccount',
            'bankaccount',
          ),
        ),
        transactionType: this.sanitizeImportText(
          this.getImportRowValue(
            row,
            'transactionType',
            'transactiontype',
            'transaction',
          ),
        ),
        chequeNumber: this.sanitizeImportText(
          this.getImportRowValue(row, 'chequeNumber', 'chequenumber'),
        ),
        chequeDate: this.sanitizeImportText(
          this.getImportRowValue(row, 'chequeDate', 'chequedate', 'ChequeDate'),
        ),
        remarks: this.sanitizeImportText(
          this.getImportRowValue(row, 'description', 'remarks', 'notes'),
        ),
      });
    });

    return rows;
  }

  private async findVendorByName(
    tenantDb: DataSource,
    businessId: string,
    vendorName: string,
  ): Promise<Party | null> {
    return tenantDb.getRepository(Party).findOne({
      where: {
        businessId,
        name: vendorName,
        type: In([PartyType.VENDOR, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      select: ['id', 'name', 'payableAccountId'],
    });
  }

  private async findAccountByName(
    tenantDb: DataSource,
    businessId: string,
    accountName: string,
  ): Promise<ChartOfAccount | null> {
    return tenantDb.getRepository(ChartOfAccount).findOne({
      where: {
        businessId,
        name: accountName,
        deletedAt: IsNull(),
      },
      select: ['id', 'name', 'code', 'isPostable'],
    });
  }

  private async notifyPurchaseVoucherImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Purchase voucher import completed'
        : 'Purchase voucher import failed';
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
        type: 'purchase_voucher_import',
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

  private async processPurchaseVoucherImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: PurchaseVoucherImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    for (const row of rows) {
      const rowLabel = `${row.voucherNumber} / ${row.vendorName}`;

      try {
        if (!row.vendorName) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Vendor name is required',
          });
          continue;
        }

        if (!row.paymentDate) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Voucher date is required',
          });
          continue;
        }

        const parsedDate = new Date(row.paymentDate);
        if (Number.isNaN(parsedDate.getTime())) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Invalid voucher date',
          });
          continue;
        }

        if (!row.paymentAmount || row.paymentAmount <= 0) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Amount must be greater than zero',
          });
          continue;
        }

        if (!row.paymentMethod) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Payment method is required',
          });
          continue;
        }

        if (!row.accountName) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Account name is required',
          });
          continue;
        }

        const vendor = await this.findVendorByName(
          tenantDb,
          user.businessId,
          row.vendorName,
        );
        if (!vendor) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Vendor not found: ${row.vendorName}`,
          });
          continue;
        }

        if (!vendor.payableAccountId) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Vendor ${row.vendorName} does not have a payable account`,
          });
          continue;
        }

        const account = await this.findAccountByName(
          tenantDb,
          user.businessId,
          row.accountName,
        );
        if (!account) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Account not found: ${row.accountName}`,
          });
          continue;
        }

        if (!account.isPostable) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Account ${row.accountName} is not postable`,
          });
          continue;
        }

        let paymentMethod: PaymentMethod;
        try {
          paymentMethod = this.resolveImportedPaymentMethod(
            row.paymentMethod,
            row.transactionType,
          );
        } catch (error) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: error instanceof Error ? error.message : 'Invalid payment method',
          });
          continue;
        }

        if (paymentMethod === PaymentMethod.CHEQUE) {
          if (!row.chequeNumber) {
            this.tenantJobService.appendLog(jobId, {
              row: row.row,
              name: rowLabel,
              status: 'error',
              error: 'Cheque number is required for cheque payments',
            });
            continue;
          }
          if (!row.chequeDate) {
            this.tenantJobService.appendLog(jobId, {
              row: row.row,
              name: rowLabel,
              status: 'error',
              error: 'Cheque date is required for cheque payments',
            });
            continue;
          }
          const parsedChequeDate = new Date(row.chequeDate);
          if (Number.isNaN(parsedChequeDate.getTime())) {
            this.tenantJobService.appendLog(jobId, {
              row: row.row,
              name: rowLabel,
              status: 'error',
              error: 'Invalid cheque date',
            });
            continue;
          }
        }

        const created = await this.voucherOps.createImportedAndApprove(
          tenantDb,
          user.businessId,
          PURCHASE_VOUCHER_CONFIG,
          {
            voucherNumber: row.voucherNumber,
            partyId: vendor.id,
            accId: account.id,
            paymentMethod,
            paymentDate: parsedDate.toISOString(),
            paymentAmount: this.roundAmount(row.paymentAmount),
            remarks: row.remarks || undefined,
            ...(paymentMethod === PaymentMethod.CHEQUE
              ? {
                  chequeNumber: row.chequeNumber,
                  chequeDate: new Date(row.chequeDate).toISOString(),
                  bankName: row.accountName,
                }
              : {}),
          },
          user.userId,
        );

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: rowLabel,
          status: 'success',
          metadata: {
            purchaseVoucherId: created.id,
            voucherNumber: created.voucherNumber,
            vendorId: vendor.id,
            vendorName: vendor.name,
            accId: account.id,
            accountName: account.name,
            paymentAmount: created.paymentAmount,
            status: created.status,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: rowLabel,
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
      description: `Purchase voucher import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyPurchaseVoucherImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importPurchaseVouchers(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parsePurchaseVoucherRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No purchase voucher rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PURCHASE_VOUCHER_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Purchase voucher import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processPurchaseVoucherImportJob(
      tenantDb,
      job.id,
      rows,
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
        description: `Purchase voucher import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await this.notifyPurchaseVoucherImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Purchase voucher import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
