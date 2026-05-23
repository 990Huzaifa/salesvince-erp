import { EntityManager } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { Transaction } from '../entities/transaction.entity';
import {
  computeBalanceMovement,
  getAccountBalanceNature,
} from './transaction-balance.helper';

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export type RecalculateAccountLedgerResult = {
  updatedCount: number;
  closingBalance: number;
};

/**
 * Recomputes currentBalance for all rows on a COA in chronological order
 * (transactionDate → createdAt → id).
 */
export async function recalculateAccountLedgerBalances(
  manager: EntityManager,
  params: {
    businessId: string;
    account: ChartOfAccount;
    chartOfAccountId: string;
  },
): Promise<RecalculateAccountLedgerResult> {
  const { businessId, account, chartOfAccountId } = params;

  const entries = await manager
    .getRepository(Transaction)
    .createQueryBuilder('t')
    .where('t.businessId = :businessId', { businessId })
    .andWhere('t.chartOfAccountId = :chartOfAccountId', { chartOfAccountId })
    .orderBy('t.transactionDate', 'ASC')
    .addOrderBy('t.createdAt', 'ASC')
    .addOrderBy('t.id', 'ASC')
    .getMany();

  const nature = getAccountBalanceNature(account);
  let runningBalance = 0;
  const toUpdate: Transaction[] = [];

  for (const entry of entries) {
    const movement = computeBalanceMovement(
      nature,
      Number(entry.debitAmount ?? 0),
      Number(entry.creditAmount ?? 0),
    );
    const nextBalance = roundAmount(runningBalance + movement);

    if (roundAmount(Number(entry.currentBalance)) !== nextBalance) {
      entry.currentBalance = nextBalance;
      toUpdate.push(entry);
    }

    runningBalance = nextBalance;
  }

  if (toUpdate.length > 0) {
    await manager.getRepository(Transaction).save(toUpdate);
  }

  return { updatedCount: toUpdate.length, closingBalance: runningBalance };
}
