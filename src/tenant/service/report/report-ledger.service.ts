import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import {
  computeBalanceMovement,
  getAccountBalanceNature,
} from 'src/tenant-db/helpers/transaction-balance.helper';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type PeriodMovementRow = {
  chartOfAccountId: string;
  debitTotal: string;
  creditTotal: string;
};

type BalanceAsOfRow = {
  chartOfAccountId: string;
  currentBalance: string;
};

@Injectable()
export class ReportLedgerService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getGeneralLedger(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      chartOfAccountId: string;
      startDate?: string;
      endDate?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );

    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: {
        id: options.chartOfAccountId,
        businessId: scopedBusinessId,
        deletedAt: IsNull(),
      },
    });

    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }

    const nature = getAccountBalanceNature(account);
    const openingBalance = await this.getBalanceAsOf(
      tenantDb,
      scopedBusinessId,
      account.id,
      startDate ? this.dayBefore(startDate) : undefined,
      account,
    );

    const entriesQb = tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('tx')
      .where('tx.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('tx.chartOfAccountId = :chartOfAccountId', {
        chartOfAccountId: account.id,
      });

    if (startDate) {
      entriesQb.andWhere('tx.transactionDate >= :startDate', {
        startDate: startOfDay(startDate),
      });
    }
    if (endDate) {
      entriesQb.andWhere('tx.transactionDate <= :endDate', {
        endDate: endOfDay(endDate),
      });
    }

    const entries = await entriesQb
      .orderBy('tx.transactionDate', 'ASC')
      .addOrderBy('tx.createdAt', 'ASC')
      .addOrderBy('tx.id', 'ASC')
      .getMany();

    let runningBalance = openingBalance;
    const lines = entries.map((entry) => {
      const debit = Number(entry.debitAmount ?? 0);
      const credit = Number(entry.creditAmount ?? 0);
      const movement = computeBalanceMovement(nature, debit, credit);
      runningBalance = roundAmount(runningBalance + movement);

      return {
        id: entry.id,
        transactionDate: entry.transactionDate,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        description: entry.description,
        debitAmount: debit > 0 ? roundAmount(debit) : null,
        creditAmount: credit > 0 ? roundAmount(credit) : null,
        movement: roundAmount(movement),
        balance: runningBalance,
      };
    });

    const periodDebit = roundAmount(
      lines.reduce((sum, line) => sum + (line.debitAmount ?? 0), 0),
    );
    const periodCredit = roundAmount(
      lines.reduce((sum, line) => sum + (line.creditAmount ?? 0), 0),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'GENERAL_LEDGER_REPORT_VIEWED',
      description: 'General ledger report viewed',
      metadata: {
        chartOfAccountId: account.id,
        accountCode: account.code,
        entryCount: lines.length,
      },
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        accountKind: account.accountKind,
        balanceNature: nature,
      },
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      openingBalance,
      closingBalance: runningBalance,
      totals: { periodDebit, periodCredit },
      entries: lines,
      meta: { total: lines.length },
    };
  }

  async getTrialBalance(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { startDate?: string; endDate?: string; asOfDate?: string },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );
    const asOfDate = options.asOfDate
      ? parseDateRange(undefined, options.asOfDate).endDate
      : endDate;

    if (!startDate && !asOfDate) {
      throw new BadRequestException(
        'Provide startDate/endDate or asOfDate for trial balance',
      );
    }

    const periodStart = startDate ?? startOfDay(new Date(0));
    const periodEnd = asOfDate ?? endDate ?? new Date();

    const accounts = await tenantDb.getRepository(ChartOfAccount).find({
      where: {
        businessId: scopedBusinessId,
        isPostable: true,
        deletedAt: IsNull(),
      },
      order: { code: 'ASC' },
    });

    if (accounts.length === 0) {
      return {
        period: {
          startDate: options.startDate ?? null,
          endDate: options.endDate ?? options.asOfDate ?? null,
        },
        rows: [],
        totals: {
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: 0,
          periodCredit: 0,
          closingDebit: 0,
          closingCredit: 0,
        },
        meta: { total: 0 },
      };
    }

    const accountIds = accounts.map((account) => account.id);
    const openingBalances = await this.getBalancesAsOfMap(
      tenantDb,
      scopedBusinessId,
      accountIds,
      this.dayBefore(periodStart),
    );
    const closingBalances = await this.getBalancesAsOfMap(
      tenantDb,
      scopedBusinessId,
      accountIds,
      periodEnd,
    );

    const movementRows = await tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('tx')
      .select('tx.chartOfAccountId', 'chartOfAccountId')
      .addSelect('COALESCE(SUM(tx.debitAmount), 0)', 'debitTotal')
      .addSelect('COALESCE(SUM(tx.creditAmount), 0)', 'creditTotal')
      .where('tx.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('tx.chartOfAccountId IN (:...accountIds)', { accountIds })
      .andWhere('tx.transactionDate >= :periodStart', {
        periodStart: startOfDay(periodStart),
      })
      .andWhere('tx.transactionDate <= :periodEnd', {
        periodEnd: endOfDay(periodEnd),
      })
      .groupBy('tx.chartOfAccountId')
      .getRawMany<PeriodMovementRow>();

    const movementByAccount = new Map(
      movementRows.map((row) => [
        row.chartOfAccountId,
        {
          debit: roundAmount(Number(row.debitTotal ?? 0)),
          credit: roundAmount(Number(row.creditTotal ?? 0)),
        },
      ]),
    );

    const rows = accounts
      .map((account) => {
        const nature = getAccountBalanceNature(account);
        const opening = openingBalances.get(account.id) ?? 0;
        const closing = closingBalances.get(account.id) ?? 0;
        const movement = movementByAccount.get(account.id) ?? {
          debit: 0,
          credit: 0,
        };

        const hasActivity =
          opening !== 0 ||
          closing !== 0 ||
          movement.debit !== 0 ||
          movement.credit !== 0;

        if (!hasActivity) {
          return null;
        }

        return {
          chartOfAccountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          accountKind: account.accountKind,
          balanceNature: nature,
          openingBalance: opening,
          periodDebit: movement.debit,
          periodCredit: movement.credit,
          closingBalance: closing,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const totals = rows.reduce(
      (sum, row) => {
        const nature = row.balanceNature;
        const openingSide = this.balanceToTrialSide(row.openingBalance, nature);
        const closingSide = this.balanceToTrialSide(row.closingBalance, nature);
        sum.openingDebit = roundAmount(sum.openingDebit + openingSide.debit);
        sum.openingCredit = roundAmount(sum.openingCredit + openingSide.credit);
        sum.periodDebit = roundAmount(sum.periodDebit + row.periodDebit);
        sum.periodCredit = roundAmount(sum.periodCredit + row.periodCredit);
        sum.closingDebit = roundAmount(sum.closingDebit + closingSide.debit);
        sum.closingCredit = roundAmount(
          sum.closingCredit + closingSide.credit,
        );
        return sum;
      },
      {
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
        closingDebit: 0,
        closingCredit: 0,
      },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'TRIAL_BALANCE_REPORT_VIEWED',
      description: 'Trial balance report viewed',
      metadata: { rowCount: rows.length, ...totals },
    });

    return {
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? options.asOfDate ?? null,
      },
      rows,
      totals,
      meta: { total: rows.length },
    };
  }

  private balanceToTrialSide(
    signedBalance: number,
    nature: ReturnType<typeof getAccountBalanceNature>,
  ): { debit: number; credit: number } {
    if (signedBalance === 0) {
      return { debit: 0, credit: 0 };
    }

    const isDebitBalance =
      (nature === 'DEBIT' && signedBalance > 0) ||
      (nature === 'CREDIT' && signedBalance < 0);

    const amount = roundAmount(Math.abs(signedBalance));
    return isDebitBalance
      ? { debit: amount, credit: 0 }
      : { debit: 0, credit: amount };
  }

  private dayBefore(date: Date): Date {
    const prior = new Date(date);
    prior.setDate(prior.getDate() - 1);
    return endOfDay(prior);
  }

  private async getBalanceAsOf(
    tenantDb: DataSource,
    businessId: string,
    chartOfAccountId: string,
    asOfDate: Date | undefined,
    account: ChartOfAccount,
  ): Promise<number> {
    const map = await this.getBalancesAsOfMap(
      tenantDb,
      businessId,
      [chartOfAccountId],
      asOfDate,
      account,
    );
    return map.get(chartOfAccountId) ?? 0;
  }

  private async getBalancesAsOfMap(
    tenantDb: DataSource,
    businessId: string,
    accountIds: string[],
    asOfDate?: Date,
    singleAccount?: ChartOfAccount,
  ): Promise<Map<string, number>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const accounts =
      singleAccount !== undefined
        ? [singleAccount]
        : await tenantDb.getRepository(ChartOfAccount).find({
            where: {
              id: In(accountIds),
              businessId,
              deletedAt: IsNull(),
            },
          });

    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const result = new Map<string, number>();

    if (!asOfDate) {
      for (const accountId of accountIds) {
        const account = accountById.get(accountId);
        if (!account) {
          continue;
        }
        const openingTx = await tenantDb.getRepository(Transaction).find({
          where: {
            businessId,
            chartOfAccountId: accountId,
            referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
          },
        });
        let balance = 0;
        for (const tx of openingTx) {
          balance = roundAmount(
            balance +
              computeBalanceMovement(
                getAccountBalanceNature(account),
                Number(tx.debitAmount ?? 0),
                Number(tx.creditAmount ?? 0),
              ),
          );
        }
        result.set(accountId, balance);
      }
      return result;
    }

    const qb = tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('tx')
      .distinctOn(['tx.chartOfAccountId'])
      .select('tx.chartOfAccountId', 'chartOfAccountId')
      .addSelect('tx.currentBalance', 'currentBalance')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.chartOfAccountId IN (:...accountIds)', { accountIds })
      .andWhere('tx.transactionDate <= :asOfDate', { asOfDate: endOfDay(asOfDate) })
      .orderBy('tx.chartOfAccountId', 'ASC')
      .addOrderBy('tx.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .addOrderBy('tx.id', 'DESC');

    const rows = await qb.getRawMany<BalanceAsOfRow>();
    for (const row of rows) {
      result.set(row.chartOfAccountId, roundAmount(Number(row.currentBalance ?? 0)));
    }

    for (const accountId of accountIds) {
      if (!result.has(accountId)) {
        result.set(accountId, 0);
      }
    }

    return result;
  }
}
