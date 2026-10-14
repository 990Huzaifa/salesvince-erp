import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import {
  PurchaseReturn,
  PurchaseReturnStatus,
} from 'src/tenant-db/entities/purchase-return.entity';
import {
  DeliveryNote,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import {
  SaleReturn,
  SaleReturnStatus,
} from 'src/tenant-db/entities/sale-return.entity';
import { PurchaseInvoiceItem } from 'src/tenant-db/entities/purchase-invoice.entity';
import { SaleInvoiceItem } from 'src/tenant-db/entities/sale-invoice.entity';
import {
  resolveCogsAccount,
  resolveInventoryControlAccount,
  resolveSalesRevenueAccount,
} from 'src/tenant-db/helpers/sales-revenue-chart-of-account.helper';
import { recalculateAccountLedgerBalances } from 'src/tenant-db/helpers/ledger-balance-recalculation.helper';
import {
  BACKFILL_TRADING_LEDGER_CONFIRM,
  BackfillTradingLedgerDto,
  TradingLedgerDocumentType,
} from '../dto/transaction/backfill-trading-ledger.dto';
import { ActivityLogService } from './activity-log.service';
import { TenantJobService } from './tenant-job.service';
import { JournalLineInput, TransactionService } from './transaction.service';

/** Same-day order for stable processing. */
const KIND_SORT_ORDER: Record<TradingLedgerDocumentType, number> = {
  [TradingLedgerDocumentType.GRN]: 0,
  [TradingLedgerDocumentType.PURCHASE_RETURN]: 1,
  [TradingLedgerDocumentType.DELIVERY_NOTE]: 2,
  [TradingLedgerDocumentType.SALE_RETURN]: 3,
};

type CandidateKind = TradingLedgerDocumentType;

type LedgerCandidate = {
  kind: CandidateKind;
  id: string;
  number: string;
  sortDate: Date;
  referenceType: AccountTransactionReferenceType;
};

type PreparedJournal = {
  candidate: LedgerCandidate;
  partyId: string | null;
  transactionDate: Date;
  description: string;
  lines: JournalLineInput[];
  expectedAccountIds: string[];
  amounts: Record<string, number>;
};

type ProcessOutcome =
  | 'would_post'
  | 'posted'
  | 'skipped_existing'
  | 'error';

const ALL_DOCUMENT_TYPES: TradingLedgerDocumentType[] = [
  TradingLedgerDocumentType.GRN,
  TradingLedgerDocumentType.PURCHASE_RETURN,
  TradingLedgerDocumentType.DELIVERY_NOTE,
  TradingLedgerDocumentType.SALE_RETURN,
];

const JOB_TYPE = 'TRADING_LEDGER_BACKFILL';

/**
 * Backfills missing/incorrect trading journals from document values.
 * Sale side amounts come from Delivery Note (and linked SO line cost) —
 * not from LIFO/FIFO batch simulation.
 */
@Injectable()
export class MissingTradingLedgerBackfillService {
  private readonly logger = new Logger(MissingTradingLedgerBackfillService.name);

  constructor(
    private readonly tenantJobService: TenantJobService,
    private readonly activityLogService: ActivityLogService,
    private readonly transactionService: TransactionService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private resolveModes(dto: BackfillTradingLedgerDto): {
    dryRun: boolean;
    forceRepost: boolean;
    documentTypes: TradingLedgerDocumentType[];
  } {
    const dryRun = dto.dryRun !== false;
    const forceRepost = dto.forceRepost === true;
    const documentTypes =
      dto.documentTypes?.length > 0
        ? [...new Set(dto.documentTypes)]
        : ALL_DOCUMENT_TYPES;

    if (!dryRun) {
      if (dto.confirm !== BACKFILL_TRADING_LEDGER_CONFIRM) {
        throw new BadRequestException(
          `Apply mode requires confirm="${BACKFILL_TRADING_LEDGER_CONFIRM}". Run dryRun first.`,
        );
      }
    }

    return { dryRun, forceRepost, documentTypes };
  }

  async startBackfill(
    tenantDb: DataSource,
    tenantCode: string,
    user: TenantRequestUser,
    dto: BackfillTradingLedgerDto,
  ) {
    const businessId = this.assertBusinessId(user.businessId);
    const { dryRun, forceRepost, documentTypes } = this.resolveModes(dto);

    await tenantDb.transaction(async (manager) => {
      await Promise.all([
        resolveInventoryControlAccount(manager, businessId),
        resolveSalesRevenueAccount(manager, businessId),
        resolveCogsAccount(manager, businessId),
      ]);
    });

    const candidates = await this.collectCandidates(
      tenantDb,
      businessId,
      documentTypes,
    );

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId,
      jobType: JOB_TYPE,
      fileName: dryRun
        ? 'trading-ledger-backfill-dry-run'
        : 'trading-ledger-backfill-apply',
      createdBy: user.userId,
      totalRows: candidates.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Trading ledger backfill started (${dryRun ? 'dry-run' : 'apply'}, ${candidates.length} docs)`,
      metadata: {
        jobId: job.id,
        jobType: JOB_TYPE,
        dryRun,
        forceRepost,
        documentTypes,
        costSource: 'DOCUMENT',
        candidateCount: candidates.length,
      },
      jobId: job.id,
    });

    void this.processBackfill(
      tenantDb,
      job.id,
      businessId,
      user.userId,
      candidates,
      dryRun,
      forceRepost,
    ).catch((error) => {
      this.logger.error(
        `Trading ledger backfill job ${job.id} failed unexpectedly`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    return {
      message: dryRun
        ? 'Trading ledger backfill dry-run started (no writes)'
        : 'Trading ledger backfill apply started',
      jobId: job.id,
      status: job.status,
      dryRun,
      forceRepost,
      documentTypes,
      costSource: 'DOCUMENT',
      candidateCount: candidates.length,
      safety: {
        stockUntouched: true,
        confirmRequiredForApply: BACKFILL_TRADING_LEDGER_CONFIRM,
        tip: dryRun
          ? `Review job ${job.id} logs, then call again with dryRun=false and confirm="${BACKFILL_TRADING_LEDGER_CONFIRM}"`
          : 'Monitor job logs; ledgers recalculate after posts complete',
      },
    };
  }

  private async collectCandidates(
    tenantDb: DataSource,
    businessId: string,
    documentTypes: TradingLedgerDocumentType[],
  ): Promise<LedgerCandidate[]> {
    const candidates: LedgerCandidate[] = [];

    if (documentTypes.includes(TradingLedgerDocumentType.GRN)) {
      const rows = await tenantDb.getRepository(Grn).find({
        where: {
          businessId,
          status: GrnStatus.APPROVED,
          deletedAt: IsNull(),
        },
        select: ['id', 'grnNumber', 'grnDate'],
        order: { grnDate: 'ASC', createdAt: 'ASC' },
      });
      for (const row of rows) {
        candidates.push({
          kind: TradingLedgerDocumentType.GRN,
          id: row.id,
          number: row.grnNumber,
          sortDate: new Date(row.grnDate),
          referenceType: AccountTransactionReferenceType.GRN,
        });
      }
    }

    if (documentTypes.includes(TradingLedgerDocumentType.PURCHASE_RETURN)) {
      const rows = await tenantDb.getRepository(PurchaseReturn).find({
        where: {
          businessId,
          status: PurchaseReturnStatus.APPROVED,
        },
        select: ['id', 'returnNumber', 'returnDate'],
        order: { returnDate: 'ASC', createdAt: 'ASC' },
      });
      for (const row of rows) {
        candidates.push({
          kind: TradingLedgerDocumentType.PURCHASE_RETURN,
          id: row.id,
          number: row.returnNumber,
          sortDate: new Date(row.returnDate),
          referenceType: AccountTransactionReferenceType.PURCHASE_RETURN,
        });
      }
    }

    if (documentTypes.includes(TradingLedgerDocumentType.DELIVERY_NOTE)) {
      const rows = await tenantDb.getRepository(DeliveryNote).find({
        where: {
          businessId,
          status: DeliveryNoteStatus.APPROVED,
        },
        select: ['id', 'deliveryNoteNumber', 'deliveryNoteDate'],
        order: { deliveryNoteDate: 'ASC', createdAt: 'ASC' },
      });
      for (const row of rows) {
        candidates.push({
          kind: TradingLedgerDocumentType.DELIVERY_NOTE,
          id: row.id,
          number: row.deliveryNoteNumber,
          sortDate: new Date(row.deliveryNoteDate),
          referenceType: AccountTransactionReferenceType.DELIVERY_NOTE,
        });
      }
    }

    if (documentTypes.includes(TradingLedgerDocumentType.SALE_RETURN)) {
      const rows = await tenantDb.getRepository(SaleReturn).find({
        where: {
          businessId,
          status: SaleReturnStatus.APPROVED,
        },
        select: ['id', 'returnNumber', 'returnDate'],
        order: { returnDate: 'ASC', createdAt: 'ASC' },
      });
      for (const row of rows) {
        candidates.push({
          kind: TradingLedgerDocumentType.SALE_RETURN,
          id: row.id,
          number: row.returnNumber,
          sortDate: new Date(row.returnDate),
          referenceType: AccountTransactionReferenceType.SALE_RETURN,
        });
      }
    }

    candidates.sort((a, b) => {
      const byDate = a.sortDate.getTime() - b.sortDate.getTime();
      if (byDate !== 0) {
        return byDate;
      }
      const byKind = KIND_SORT_ORDER[a.kind] - KIND_SORT_ORDER[b.kind];
      if (byKind !== 0) {
        return byKind;
      }
      return a.number.localeCompare(b.number);
    });

    return candidates;
  }

  private async processBackfill(
    tenantDb: DataSource,
    jobId: string,
    businessId: string,
    actorUserId: string,
    candidates: LedgerCandidate[],
    dryRun: boolean,
    forceRepost: boolean,
  ) {
    this.tenantJobService.startJob(jobId);

    const counts: Record<ProcessOutcome, number> = {
      would_post: 0,
      posted: 0,
      skipped_existing: 0,
      error: 0,
    };
    const affectedAccountIds = new Set<string>();

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const row = index + 1;
        const name = `${candidate.kind}:${candidate.number}`;

        try {
          const result = await this.processOne(
            tenantDb,
            businessId,
            candidate,
            dryRun,
            forceRepost,
          );

          counts[result.outcome] += 1;
          for (const accountId of result.affectedAccountIds ?? []) {
            affectedAccountIds.add(accountId);
          }

          const isSuccess =
            result.outcome === 'posted' || result.outcome === 'would_post';

          this.tenantJobService.appendLog(jobId, {
            row,
            name,
            status: isSuccess ? 'success' : 'error',
            error: result.error,
            metadata: {
              outcome: result.outcome,
              kind: candidate.kind,
              documentId: candidate.id,
              documentNumber: candidate.number,
              documentDate: candidate.sortDate.toISOString().slice(0, 10),
              dryRun,
              forceRepost,
              costSource: 'DOCUMENT',
              existingLineCount: result.existingLineCount ?? 0,
              amounts: result.amounts,
              description: result.description,
            },
          });
        } catch (error) {
          counts.error += 1;
          this.tenantJobService.appendLog(jobId, {
            row,
            name,
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'Unexpected backfill error',
            metadata: {
              outcome: 'error',
              kind: candidate.kind,
              documentId: candidate.id,
            },
          });
        }
      }

      let recalcResults: Array<{
        chartOfAccountId: string;
        code: string | null;
        updatedCount: number;
        closingBalance: number;
      }> = [];

      if (!dryRun && (counts.posted > 0 || forceRepost)) {
        recalcResults = await this.recalculateTradingLedgers(
          tenantDb,
          businessId,
          affectedAccountIds,
        );
      }

      this.tenantJobService.completeJob(jobId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: actorUserId,
        businessId,
        action: 'TENANT_JOB_COMPLETED',
        description: `Trading ledger backfill completed (${dryRun ? 'dry-run' : 'apply'})`,
        metadata: {
          jobId,
          jobType: JOB_TYPE,
          dryRun,
          forceRepost,
          costSource: 'DOCUMENT',
          counts,
          total: candidates.length,
          accountsRecalculated: recalcResults.length,
          recalcResults,
        },
        jobId,
      });
    } catch (error) {
      this.tenantJobService.failJob(jobId);
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: actorUserId,
        businessId,
        action: 'TENANT_JOB_FAILED',
        description: 'Trading ledger backfill failed',
        metadata: {
          jobId,
          jobType: JOB_TYPE,
          dryRun,
          error: error instanceof Error ? error.message : String(error),
        },
        jobId,
      });
      throw error;
    }
  }

  private async processOne(
    tenantDb: DataSource,
    businessId: string,
    candidate: LedgerCandidate,
    dryRun: boolean,
    forceRepost: boolean,
  ): Promise<{
    outcome: ProcessOutcome;
    error?: string;
    existingLineCount?: number;
    amounts?: Record<string, number>;
    description?: string;
    affectedAccountIds?: string[];
  }> {
    return tenantDb.transaction(async (manager) => {
      const existing = await manager.getRepository(Transaction).find({
        where: {
          businessId,
          referenceType: candidate.referenceType,
          referenceId: candidate.id,
        },
        select: ['id', 'chartOfAccountId'],
      });

      if (existing.length > 0 && !forceRepost) {
        return {
          outcome: 'skipped_existing',
          error: `Ledger already exists (${existing.length} lines). Use forceRepost=true to replace.`,
          existingLineCount: existing.length,
        };
      }

      const prepared = await this.prepareJournal(manager, businessId, candidate);

      if (dryRun) {
        return {
          outcome: 'would_post',
          existingLineCount: existing.length,
          amounts: prepared.amounts,
          description: prepared.description,
          affectedAccountIds: prepared.expectedAccountIds,
          error:
            existing.length > 0
              ? `Would delete ${existing.length} existing lines and repost`
              : undefined,
        };
      }

      if (existing.length > 0 && forceRepost) {
        await this.transactionService.deleteLedgerEntriesByReference(manager, {
          businessId,
          referenceType: candidate.referenceType,
          referenceId: candidate.id,
        });
      }

      await this.transactionService.postJournal(manager, {
        businessId,
        referenceType: candidate.referenceType,
        referenceId: candidate.id,
        partyId: prepared.partyId,
        transactionDate: prepared.transactionDate,
        description: prepared.description,
        lines: prepared.lines,
      });

      return {
        outcome: 'posted',
        existingLineCount: existing.length,
        amounts: prepared.amounts,
        description: prepared.description,
        affectedAccountIds: prepared.expectedAccountIds,
      };
    });
  }

  private async prepareJournal(
    manager: EntityManager,
    businessId: string,
    candidate: LedgerCandidate,
  ): Promise<PreparedJournal> {
    switch (candidate.kind) {
      case TradingLedgerDocumentType.GRN:
        return this.prepareGrnJournal(manager, businessId, candidate);
      case TradingLedgerDocumentType.PURCHASE_RETURN:
        return this.preparePurchaseReturnJournal(manager, businessId, candidate);
      case TradingLedgerDocumentType.DELIVERY_NOTE:
        return this.prepareDeliveryNoteJournal(manager, businessId, candidate);
      case TradingLedgerDocumentType.SALE_RETURN:
        return this.prepareSaleReturnJournal(manager, businessId, candidate);
      default:
        throw new BadRequestException(`Unsupported document type`);
    }
  }

  private async prepareGrnJournal(
    manager: EntityManager,
    businessId: string,
    candidate: LedgerCandidate,
  ): Promise<PreparedJournal> {
    const grn = await manager.getRepository(Grn).findOne({
      where: {
        id: candidate.id,
        businessId,
        status: GrnStatus.APPROVED,
        deletedAt: IsNull(),
      },
      relations: { vendor: true, purchaseOrder: true },
    });
    if (!grn) {
      throw new BadRequestException('Approved GRN not found');
    }
    if (!grn.vendor?.payableAccountId) {
      throw new BadRequestException(
        `Vendor payable account missing for GRN ${grn.grnNumber}`,
      );
    }

    const amount = this.roundAmount(Number(grn.totalAmount));
    if (amount <= 0) {
      throw new BadRequestException(
        `GRN ${grn.grnNumber} totalAmount must be > 0`,
      );
    }

    const inventory = await resolveInventoryControlAccount(manager, businessId);
    const orderNumber =
      grn.purchaseOrder?.orderNumber?.trim() || grn.grnNumber;
    const description = `Purchase Order - ${orderNumber}`;

    return {
      candidate,
      partyId: grn.vendorId,
      transactionDate: new Date(grn.grnDate),
      description,
      lines: [
        {
          chartOfAccountId: inventory.id,
          debitAmount: amount,
          description,
        },
        {
          chartOfAccountId: grn.vendor.payableAccountId,
          creditAmount: amount,
          description,
        },
      ],
      expectedAccountIds: [inventory.id, grn.vendor.payableAccountId],
      amounts: { inventoryDebit: amount, payableCredit: amount },
    };
  }

  private lineAmountForInvoiceQty(
    invoiceItem: { quantity: number; totalAmount: number },
    quantity: number,
  ): number {
    const invoicedQty = Number(invoiceItem.quantity);
    if (invoicedQty <= 0) {
      return 0;
    }
    return this.roundAmount(
      (Number(invoiceItem.totalAmount) / invoicedQty) * quantity,
    );
  }

  private async preparePurchaseReturnJournal(
    manager: EntityManager,
    businessId: string,
    candidate: LedgerCandidate,
  ): Promise<PreparedJournal> {
    const purchaseReturn = await manager.getRepository(PurchaseReturn).findOne({
      where: {
        id: candidate.id,
        businessId,
        status: PurchaseReturnStatus.APPROVED,
      },
      relations: {
        purchaseReturnItems: true,
        purchaseInvoice: {
          vendor: true,
          items: true,
        },
      },
    });
    if (!purchaseReturn) {
      throw new BadRequestException('Approved purchase return not found');
    }

    const invoice = purchaseReturn.purchaseInvoice;
    const vendor = invoice?.vendor;
    if (!vendor?.payableAccountId) {
      throw new BadRequestException(
        `Vendor payable account missing for return ${purchaseReturn.returnNumber}`,
      );
    }

    const invoiceItems = (invoice.items ?? []) as PurchaseInvoiceItem[];
    let totalAmount = 0;
    for (const item of purchaseReturn.purchaseReturnItems ?? []) {
      const invoiceItem = invoiceItems.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
      );
      if (!invoiceItem) {
        throw new BadRequestException(
          `Purchase return ${purchaseReturn.returnNumber} item no longer matches invoice`,
        );
      }
      totalAmount += this.lineAmountForInvoiceQty(
        invoiceItem,
        Number(item.quantity),
      );
    }
    totalAmount = this.roundAmount(totalAmount);
    if (totalAmount <= 0) {
      throw new BadRequestException(
        `Purchase return ${purchaseReturn.returnNumber} amount must be > 0`,
      );
    }

    const inventory = await resolveInventoryControlAccount(manager, businessId);
    const description = `Purchase return ${purchaseReturn.returnNumber} - vendor payable reduced`;

    return {
      candidate,
      partyId: vendor.id,
      transactionDate: new Date(purchaseReturn.returnDate),
      description,
      lines: [
        {
          chartOfAccountId: vendor.payableAccountId,
          debitAmount: totalAmount,
          description,
        },
        {
          chartOfAccountId: inventory.id,
          creditAmount: totalAmount,
          description,
        },
      ],
      expectedAccountIds: [vendor.payableAccountId, inventory.id],
      amounts: { payableDebit: totalAmount, inventoryCredit: totalAmount },
    };
  }

  private buildSaleJournalLines(params: {
    receivableAccountId: string;
    salesRevenueAccountId: string;
    cogsAccountId: string;
    inventoryAccountId: string;
    saleAmount: number;
    cogsAmount: number;
    description: string;
  }): JournalLineInput[] {
    const lines: JournalLineInput[] = [
      {
        chartOfAccountId: params.receivableAccountId,
        debitAmount: params.saleAmount,
        description: params.description,
      },
      {
        chartOfAccountId: params.salesRevenueAccountId,
        creditAmount: params.saleAmount,
        description: params.description,
      },
    ];

    if (params.cogsAmount > 0) {
      lines.push(
        {
          chartOfAccountId: params.cogsAccountId,
          debitAmount: params.cogsAmount,
          description: params.description,
        },
        {
          chartOfAccountId: params.inventoryAccountId,
          creditAmount: params.cogsAmount,
          description: params.description,
        },
      );
    }

    return lines;
  }

  /**
   * Sale journal from Delivery Note document values:
   * - receivableDebit / salesRevenueCredit = DN.totalAmount
   * - cogsDebit / inventoryCredit = sum(deliveredQty × SO line purchaseUnitPrice)
   */
  private async prepareDeliveryNoteJournal(
    manager: EntityManager,
    businessId: string,
    candidate: LedgerCandidate,
  ): Promise<PreparedJournal> {
    const deliveryNote = await manager.getRepository(DeliveryNote).findOne({
      where: {
        id: candidate.id,
        businessId,
        status: DeliveryNoteStatus.APPROVED,
      },
      relations: {
        customer: true,
        saleOrder: true,
        items: { saleOrderItem: true },
      },
    });
    if (!deliveryNote) {
      throw new BadRequestException('Approved delivery note not found');
    }
    if (!deliveryNote.customer?.receivableAccountId) {
      throw new BadRequestException(
        `Customer receivable account missing for DN ${deliveryNote.deliveryNoteNumber}`,
      );
    }

    const saleAmount = this.roundAmount(Number(deliveryNote.totalAmount));
    if (saleAmount <= 0) {
      throw new BadRequestException(
        `Delivery note ${deliveryNote.deliveryNoteNumber} totalAmount must be > 0`,
      );
    }

    let cogsAmount = 0;
    for (const item of deliveryNote.items ?? []) {
      const qty = Number(item.deliveredQuantity ?? 0);
      if (qty <= 0) {
        continue;
      }
      const unitCost = Number(item.saleOrderItem?.purchaseUnitPrice ?? 0);
      cogsAmount += qty * unitCost;
    }
    cogsAmount = this.roundAmount(cogsAmount);

    const [salesRevenue, cogs, inventory] = await Promise.all([
      resolveSalesRevenueAccount(manager, businessId),
      resolveCogsAccount(manager, businessId),
      resolveInventoryControlAccount(manager, businessId),
    ]);

    const orderNumber =
      deliveryNote.saleOrder?.orderNumber?.trim() ||
      deliveryNote.deliveryNoteNumber;
    const description = `Sale Order - ${orderNumber}`;
    const lines = this.buildSaleJournalLines({
      receivableAccountId: deliveryNote.customer.receivableAccountId,
      salesRevenueAccountId: salesRevenue.id,
      cogsAccountId: cogs.id,
      inventoryAccountId: inventory.id,
      saleAmount,
      cogsAmount,
      description,
    });

    return {
      candidate,
      partyId: deliveryNote.customerId,
      transactionDate: new Date(deliveryNote.deliveryNoteDate),
      description,
      lines,
      expectedAccountIds: [
        ...new Set(lines.map((line) => line.chartOfAccountId)),
      ],
      amounts: {
        receivableDebit: saleAmount,
        salesRevenueCredit: saleAmount,
        cogsDebit: cogsAmount,
        inventoryCredit: cogsAmount,
      },
    };
  }

  private async prepareSaleReturnJournal(
    manager: EntityManager,
    businessId: string,
    candidate: LedgerCandidate,
  ): Promise<PreparedJournal> {
    const saleReturn = await manager.getRepository(SaleReturn).findOne({
      where: {
        id: candidate.id,
        businessId,
        status: SaleReturnStatus.APPROVED,
      },
      relations: {
        saleReturnItems: true,
        saleInvoice: {
          customer: true,
          items: true,
          saleOrder: { items: true },
        },
      },
    });
    if (!saleReturn) {
      throw new BadRequestException('Approved sale return not found');
    }

    const invoice = saleReturn.saleInvoice;
    const customer = invoice?.customer;
    if (!customer?.receivableAccountId) {
      throw new BadRequestException(
        `Customer receivable account missing for return ${saleReturn.returnNumber}`,
      );
    }

    const invoiceItems = (invoice.items ?? []) as SaleInvoiceItem[];
    const orderItems = invoice.saleOrder?.items ?? [];

    let totalAmount = 0;
    let cogsAmount = 0;

    for (const item of saleReturn.saleReturnItems ?? []) {
      const invoiceItem = invoiceItems.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
      );
      if (!invoiceItem) {
        throw new BadRequestException(
          `Sale return ${saleReturn.returnNumber} item no longer matches invoice`,
        );
      }

      const qty = Number(item.quantity);
      totalAmount += this.lineAmountForInvoiceQty(invoiceItem, qty);

      const orderItem = orderItems.find(
        (row) =>
          row.productId === invoiceItem.productId &&
          row.uomId === invoiceItem.uomId &&
          (row.productFlavourId ?? null) ===
            (invoiceItem.productFlavourId ?? null),
      );
      cogsAmount += qty * Number(orderItem?.purchaseUnitPrice ?? 0);
    }

    totalAmount = this.roundAmount(totalAmount);
    cogsAmount = this.roundAmount(cogsAmount);
    if (totalAmount <= 0) {
      throw new BadRequestException(
        `Sale return ${saleReturn.returnNumber} amount must be > 0`,
      );
    }

    const [salesRevenue, cogs, inventory] = await Promise.all([
      resolveSalesRevenueAccount(manager, businessId),
      resolveCogsAccount(manager, businessId),
      resolveInventoryControlAccount(manager, businessId),
    ]);

    const description = `Sale return ${saleReturn.returnNumber} - customer receivable reduced`;
    const lines: JournalLineInput[] = [
      {
        chartOfAccountId: customer.receivableAccountId,
        creditAmount: totalAmount,
        description,
      },
      {
        chartOfAccountId: salesRevenue.id,
        debitAmount: totalAmount,
        description,
      },
    ];
    if (cogsAmount > 0) {
      lines.push(
        {
          chartOfAccountId: inventory.id,
          debitAmount: cogsAmount,
          description,
        },
        {
          chartOfAccountId: cogs.id,
          creditAmount: cogsAmount,
          description,
        },
      );
    }

    return {
      candidate,
      partyId: customer.id,
      transactionDate: new Date(saleReturn.returnDate),
      description,
      lines,
      expectedAccountIds: [
        ...new Set(lines.map((line) => line.chartOfAccountId)),
      ],
      amounts: {
        receivableCredit: totalAmount,
        salesRevenueDebit: totalAmount,
        inventoryDebit: cogsAmount,
        cogsCredit: cogsAmount,
      },
    };
  }

  private async recalculateTradingLedgers(
    tenantDb: DataSource,
    businessId: string,
    affectedAccountIds: Set<string>,
  ) {
    return tenantDb.transaction(async (manager) => {
      const [inventory, salesRevenue, cogs] = await Promise.all([
        resolveInventoryControlAccount(manager, businessId),
        resolveSalesRevenueAccount(manager, businessId),
        resolveCogsAccount(manager, businessId),
      ]);

      const accountIds = new Set<string>([
        inventory.id,
        salesRevenue.id,
        cogs.id,
        ...affectedAccountIds,
      ]);

      const results: Array<{
        chartOfAccountId: string;
        code: string | null;
        updatedCount: number;
        closingBalance: number;
      }> = [];

      for (const chartOfAccountId of accountIds) {
        const account = await manager.getRepository(ChartOfAccount).findOne({
          where: {
            id: chartOfAccountId,
            businessId,
            deletedAt: IsNull(),
          },
        });
        if (!account) {
          continue;
        }

        const result = await recalculateAccountLedgerBalances(manager, {
          businessId,
          account,
          chartOfAccountId,
        });

        results.push({
          chartOfAccountId,
          code: account.code ?? null,
          updatedCount: result.updatedCount,
          closingBalance: result.closingBalance,
        });
      }

      return results;
    });
  }
}
