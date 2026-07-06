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
import { SALE_VOUCHER_CONFIG } from './voucher-configs';
import { PartyVoucherImportInput, VoucherListOptions } from './voucher.types';
import {
  CreateSaleVoucherItemDto,
  UpdateSaleVoucherDto,
} from '../../dto/voucher/sale-voucher.dto';

type SaleVoucherImportRow = {
  row: number;
  voucherNumber: string;
  customerName: string;
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
export class SaleVoucherService {
  constructor(
    private readonly voucherOps: VoucherOperationsService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  create(
    tenantDb: DataSource,
    businessId: string,
    items: CreateSaleVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.create(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
      items,
      userId,
    );
  }

  createAndApprove(
    tenantDb: DataSource,
    businessId: string,
    items: CreateSaleVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.createAndApprove(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
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
      SALE_VOUCHER_CONFIG,
      options,
      userId,
    );
  }

  getById(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.getById(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  edit(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    dto: UpdateSaleVoucherDto,
    userId: string,
  ) {
    return this.voucherOps.edit(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
      id,
      dto,
      userId,
    );
  }

  approve(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.approve(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  reject(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.reject(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  cancel(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.cancel(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
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

  private parseSaleVoucherRowsFromFile(
    file: Express.Multer.File,
  ): SaleVoucherImportRow[] {
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

    const rows: SaleVoucherImportRow[] = [];

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
        customerName: this.sanitizeImportText(
          this.getImportRowValue(
            row,
            'customerName',
            'customer',
            'customername',
          ),
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

  private async findCustomerByName(
    tenantDb: DataSource,
    businessId: string,
    customerName: string,
  ): Promise<Party | null> {
    return tenantDb.getRepository(Party).findOne({
      where: {
        businessId,
        name: customerName,
        type: In([PartyType.CUSTOMER, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      select: ['id', 'name', 'receivableAccountId'],
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

  private async notifySaleVoucherImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Sale voucher import completed'
        : 'Sale voucher import failed';
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
        type: 'sale_voucher_import',
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

  private async processSaleVoucherImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: SaleVoucherImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    for (const row of rows) {
      const rowLabel = `${row.voucherNumber} / ${row.customerName}`;

      try {
        if (!row.customerName) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Customer name is required',
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

        const customer = await this.findCustomerByName(
          tenantDb,
          user.businessId,
          row.customerName,
        );
        if (!customer) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Customer not found: ${row.customerName}`,
          });
          continue;
        }

        if (!customer.receivableAccountId) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Customer ${row.customerName} does not have a receivable account`,
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

        const importDto: PartyVoucherImportInput = {
          voucherNumber: row.voucherNumber,
          partyId: customer.id,
          accId: account.id,
          paymentMethod,
          paymentDate: parsedDate.toISOString(),
          paymentAmount: this.roundAmount(row.paymentAmount),
          remarks: row.remarks,
          ...(paymentMethod === PaymentMethod.CHEQUE
            ? {
                chequeNumber: row.chequeNumber,
                chequeDate: new Date(row.chequeDate).toISOString(),
              }
            : {}),
        };

        const created = await this.voucherOps.createImported(
          tenantDb,
          user.businessId,
          SALE_VOUCHER_CONFIG,
          importDto,
          user.userId,
        );

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: rowLabel,
          status: 'success',
          metadata: {
            saleVoucherId: created.id,
            voucherNumber: created.voucherNumber,
            customerId: customer.id,
            customerName: customer.name,
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
      description: `Sale voucher import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifySaleVoucherImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importSaleVouchers(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseSaleVoucherRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No sale voucher rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'SALE_VOUCHER_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Sale voucher import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processSaleVoucherImportJob(
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
        description: `Sale voucher import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await this.notifySaleVoucherImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Sale voucher import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
