import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from 'src/tenant-db/entities/chart-of-account.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import { Transaction } from 'src/tenant-db/entities/transaction.entity';
import { ActivityLogService } from './activity-log.service';

export type LedgerQueryOptions = {
  chartOfAccountId: string;
  startDate?: string;
  endDate?: string;
};

export type AdvanceLedgerSortOrder = 'credit_first' | 'debit_first';

export type AdvanceLedgerQueryOptions = {
  chartOfAccountId: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: AdvanceLedgerSortOrder;
};

export type AdvanceLedgerMode = 'CUSTOMER' | 'VENDOR';

export type AdvanceLedgerEntry = {
  id: string;
  chartOfAccountId: string;
  debitAmount: number | null;
  creditAmount: number | null;
  currentBalance: number;
  description: string | null;
  transactionDate: Date;
  referenceType: Transaction['referenceType'];
  referenceId: string | null;
  referenceLinkId: string | null;
  createdAt: Date;
  updatedAt: Date;
  progressPercentage: number | null;
};

type ResolvedPartyAccount = {
  account: ChartOfAccount;
  party: Party;
  ledgerMode: AdvanceLedgerMode;
};

@Injectable()
export class FinanceService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundPercentage(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private parseDateParam(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return parsed;
  }

  private amount(value: number | null | undefined): number {
    return this.roundAmount(Number(value ?? 0));
  }

  private parseDateRange(
    startDateStr?: string,
    endDateStr?: string,
  ): { startDate?: Date; endDate?: Date } {
    const startDate = startDateStr
      ? this.parseDateParam(startDateStr, 'startDate')
      : undefined;
    const endDate = endDateStr
      ? this.parseDateParam(endDateStr, 'endDate')
      : undefined;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'startDate must be on or before endDate',
      );
    }

    return { startDate, endDate };
  }

  private async resolvePartyAccount(
    tenantDb: DataSource,
    businessId: string,
    chartOfAccountId: string,
  ): Promise<ResolvedPartyAccount> {
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: {
        id: chartOfAccountId,
        businessId,
        deletedAt: IsNull(),
      },
    });
    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }

    if (
      account.accountKind !== ChartOfAccountKind.PARTY_RECEIVABLE &&
      account.accountKind !== ChartOfAccountKind.PARTY_PAYABLE
    ) {
      throw new BadRequestException(
        'Advance ledger is only available for party receivable or payable accounts',
      );
    }

    if (!account.partyId) {
      throw new BadRequestException(
        'Chart of account is not linked to a party',
      );
    }

    const party = await tenantDb.getRepository(Party).findOne({
      where: {
        id: account.partyId,
        businessId,
        deletedAt: IsNull(),
      },
    });
    if (!party) {
      throw new NotFoundException('Party not found for this account');
    }

    const ledgerMode: AdvanceLedgerMode =
      account.accountKind === ChartOfAccountKind.PARTY_RECEIVABLE
        ? 'CUSTOMER'
        : 'VENDOR';

    return { account, party, ledgerMode };
  }

  private mapAdvanceLedgerEntry(
    tx: Transaction,
    progressPercentage: number | null,
  ): AdvanceLedgerEntry {
    return {
      id: tx.id,
      chartOfAccountId: tx.chartOfAccountId,
      debitAmount: tx.debitAmount != null ? Number(tx.debitAmount) : null,
      creditAmount: tx.creditAmount != null ? Number(tx.creditAmount) : null,
      currentBalance: this.roundAmount(Number(tx.currentBalance)),
      description: tx.description,
      transactionDate: tx.transactionDate,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      referenceLinkId: tx.referenceId,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      progressPercentage,
    };
  }

  private applyCustomerProgress(
    transactions: Transaction[],
  ): { entries: AdvanceLedgerEntry[]; poolTotal: number } {
    const totalCredit = this.roundAmount(
      transactions.reduce((sum, tx) => sum + this.amount(tx.creditAmount), 0),
    );
    let remainingCredit = totalCredit;

    const entries = transactions.map((tx) => {
      const debit = this.amount(tx.debitAmount);
      const credit = this.amount(tx.creditAmount);

      if (debit > 0) {
        if (remainingCredit > 0) {
          const coveredAmount = Math.min(debit, remainingCredit);
          const progressPercentage = this.roundPercentage(
            (coveredAmount / debit) * 100,
          );
          remainingCredit = this.roundAmount(remainingCredit - coveredAmount);
          return this.mapAdvanceLedgerEntry(tx, progressPercentage);
        }
        return this.mapAdvanceLedgerEntry(tx, 0);
      }

      if (credit > 0) {
        return this.mapAdvanceLedgerEntry(tx, null);
      }

      return this.mapAdvanceLedgerEntry(tx, 0);
    });

    return { entries, poolTotal: totalCredit };
  }

  private applyVendorProgress(
    transactions: Transaction[],
  ): { entries: AdvanceLedgerEntry[]; poolTotal: number } {
    const totalDebit = this.roundAmount(
      transactions.reduce((sum, tx) => sum + this.amount(tx.debitAmount), 0),
    );
    let remainingDebit = totalDebit;

    const entries = transactions.map((tx) => {
      const debit = this.amount(tx.debitAmount);
      const credit = this.amount(tx.creditAmount);

      if (credit > 0) {
        if (remainingDebit > 0) {
          const coveredAmount = Math.min(credit, remainingDebit);
          const progressPercentage = this.roundPercentage(
            (coveredAmount / credit) * 100,
          );
          remainingDebit = this.roundAmount(remainingDebit - coveredAmount);
          return this.mapAdvanceLedgerEntry(tx, progressPercentage);
        }
        return this.mapAdvanceLedgerEntry(tx, 0);
      }

      if (debit > 0) {
        return this.mapAdvanceLedgerEntry(tx, null);
      }

      return this.mapAdvanceLedgerEntry(tx, 0);
    });

    return { entries, poolTotal: totalDebit };
  }

  private applySortOrder(
    entries: AdvanceLedgerEntry[],
    sortOrder?: AdvanceLedgerSortOrder,
  ): AdvanceLedgerEntry[] {
    if (sortOrder === 'credit_first') {
      return [...entries].sort(
        (a, b) => this.amount(b.creditAmount) - this.amount(a.creditAmount),
      );
    }
    if (sortOrder === 'debit_first') {
      return [...entries].sort(
        (a, b) => this.amount(b.debitAmount) - this.amount(a.debitAmount),
      );
    }
    return entries;
  }

  private async fetchTransactionsForAccount(
    tenantDb: DataSource,
    businessId: string,
    chartOfAccountId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<Transaction[]> {
    const qb = tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .where('t.businessId = :businessId', { businessId })
      .andWhere('t.chartOfAccountId = :chartOfAccountId', { chartOfAccountId });

    if (startDate) {
      qb.andWhere('t.transactionDate >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('t.transactionDate <= :endDate', { endDate });
    }

    return qb
      .orderBy('t.transactionDate', 'ASC')
      .addOrderBy('t.createdAt', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .getMany();
  }

  async getLedger(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: LedgerQueryOptions,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const chartOfAccountId = options.chartOfAccountId?.trim();
    if (!chartOfAccountId) {
      throw new BadRequestException('chartOfAccountId is required');
    }

    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: {
        id: chartOfAccountId,
        businessId: scopedBusinessId,
        deletedAt: IsNull(),
      },
    });
    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }

    const { startDate, endDate } = this.parseDateRange(
      options.startDate,
      options.endDate,
    );

    const txRepo = tenantDb.getRepository(Transaction);

    let openingBalance = 0;
    if (startDate) {
      const priorEntry = await txRepo
        .createQueryBuilder('t')
        .where('t.businessId = :businessId', { businessId: scopedBusinessId })
        .andWhere('t.chartOfAccountId = :chartOfAccountId', {
          chartOfAccountId,
        })
        .andWhere('t.transactionDate < :startDate', { startDate })
        .orderBy('t.transactionDate', 'DESC')
        .addOrderBy('t.createdAt', 'DESC')
        .addOrderBy('t.id', 'DESC')
        .getOne();

      openingBalance = priorEntry
        ? this.roundAmount(Number(priorEntry.currentBalance))
        : 0;
    }

    const entries = await this.fetchTransactionsForAccount(
      tenantDb,
      scopedBusinessId,
      chartOfAccountId,
      startDate,
      endDate,
    );

    const closingBalance = entries.length
      ? this.roundAmount(Number(entries[entries.length - 1].currentBalance))
      : openingBalance;

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LEDGER_VIEWED',
      description: `Ledger viewed for account ${account.code}`,
      metadata: {
        chartOfAccountId,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        entryCount: entries.length,
      },
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        isPostable: account.isPostable,
      },
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      openingBalance,
      closingBalance,
      entries,
      meta: { total: entries.length },
    };
  }

  async getAdvanceLedger(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: AdvanceLedgerQueryOptions,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const chartOfAccountId = options.chartOfAccountId?.trim();
    if (!chartOfAccountId) {
      throw new BadRequestException('chartOfAccountId is required');
    }

    if (
      options.sortOrder &&
      options.sortOrder !== 'credit_first' &&
      options.sortOrder !== 'debit_first'
    ) {
      throw new BadRequestException(
        'sortOrder must be credit_first or debit_first',
      );
    }

    const { account, party, ledgerMode } = await this.resolvePartyAccount(
      tenantDb,
      scopedBusinessId,
      chartOfAccountId,
    );

    const { startDate, endDate } = this.parseDateRange(
      options.startDate,
      options.endDate,
    );

    const transactions = await this.fetchTransactionsForAccount(
      tenantDb,
      scopedBusinessId,
      chartOfAccountId,
      startDate,
      endDate,
    );

    const { entries: progressEntries, poolTotal } =
      ledgerMode === 'CUSTOMER'
        ? this.applyCustomerProgress(transactions)
        : this.applyVendorProgress(transactions);

    const entries = this.applySortOrder(progressEntries, options.sortOrder);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'ADVANCE_LEDGER_VIEWED',
      description: `Advance ledger viewed for account ${account.code}`,
      metadata: {
        chartOfAccountId,
        ledgerMode,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        entryCount: entries.length,
      },
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        accountKind: account.accountKind,
      },
      party: {
        id: party.id,
        code: party.code,
        name: party.name,
        type: party.type,
      },
      ledgerMode,
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      poolTotal,
      entries,
      meta: { total: entries.length },
    };
  }
}
