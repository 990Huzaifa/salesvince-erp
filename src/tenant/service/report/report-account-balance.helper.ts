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
import { endOfDay, roundAmount, startOfDay } from './report-query.helper';

type BalanceAsOfRow = {
  chartOfAccountId: string;
  currentBalance: string;
};

export type PeriodMovementRow = {
  chartOfAccountId: string;
  debitTotal: string;
  creditTotal: string;
};

export async function getBalancesAsOfMap(
  tenantDb: DataSource,
  businessId: string,
  accounts: ChartOfAccount[],
  asOfDate?: Date,
): Promise<Map<string, number>> {
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length === 0) {
    return new Map();
  }

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

  const rows = await tenantDb
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
    .addOrderBy('tx.id', 'DESC')
    .getRawMany<BalanceAsOfRow>();

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

export async function getPeriodMovementsByAccount(
  tenantDb: DataSource,
  businessId: string,
  accountIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<Map<string, { debit: number; credit: number }>> {
  if (accountIds.length === 0) {
    return new Map();
  }

  const rows = await tenantDb
    .getRepository(Transaction)
    .createQueryBuilder('tx')
    .select('tx.chartOfAccountId', 'chartOfAccountId')
    .addSelect('COALESCE(SUM(tx.debitAmount), 0)', 'debitTotal')
    .addSelect('COALESCE(SUM(tx.creditAmount), 0)', 'creditTotal')
    .where('tx.businessId = :businessId', { businessId })
    .andWhere('tx.chartOfAccountId IN (:...accountIds)', { accountIds })
    .andWhere('tx.transactionDate >= :startDate', { startDate: startOfDay(startDate) })
    .andWhere('tx.transactionDate <= :endDate', { endDate: endOfDay(endDate) })
    .groupBy('tx.chartOfAccountId')
    .getRawMany<PeriodMovementRow>();

  return new Map(
    rows.map((row) => [
      row.chartOfAccountId,
      {
        debit: roundAmount(Number(row.debitTotal ?? 0)),
        credit: roundAmount(Number(row.creditTotal ?? 0)),
      },
    ]),
  );
}

export function computeProfitAndLossAmount(
  account: ChartOfAccount,
  debit: number,
  credit: number,
): number {
  const nature = getAccountBalanceNature(account);
  const movement = computeBalanceMovement(nature, debit, credit);

  if (account.level1 === 4) {
    return roundAmount(Math.max(movement, 0));
  }
  if (account.level1 === 5) {
    return roundAmount(Math.max(-movement, 0));
  }

  return roundAmount(Math.abs(movement));
}

export function displayBalanceSheetAmount(
  account: ChartOfAccount,
  signedBalance: number,
): number {
  const nature = getAccountBalanceNature(account);
  if (signedBalance === 0) {
    return 0;
  }

  if (account.level1 === 1) {
    return nature === 'DEBIT'
      ? roundAmount(Math.max(signedBalance, 0))
      : roundAmount(Math.max(-signedBalance, 0));
  }

  return nature === 'CREDIT'
    ? roundAmount(Math.max(signedBalance, 0))
    : roundAmount(Math.max(-signedBalance, 0));
}

export async function loadPostableAccountsByLevel(
  tenantDb: DataSource,
  businessId: string,
  level1: number,
): Promise<ChartOfAccount[]> {
  return tenantDb.getRepository(ChartOfAccount).find({
    where: {
      businessId,
      level1,
      isPostable: true,
      deletedAt: IsNull(),
    },
    order: { code: 'ASC' },
  });
}

export async function loadPostableAccountsByLevels(
  tenantDb: DataSource,
  businessId: string,
  levels: number[],
): Promise<ChartOfAccount[]> {
  return tenantDb.getRepository(ChartOfAccount).find({
    where: {
      businessId,
      level1: In(levels),
      isPostable: true,
      deletedAt: IsNull(),
    },
    order: { code: 'ASC' },
  });
}
