import { ChartOfAccount, ChartOfAccountKind } from '../entities/chart-of-account.entity';

export type AccountBalanceNature = 'DEBIT' | 'CREDIT';

/** Normal balance side by account kind / chart root (level1). */
export function getAccountBalanceNature(
  account: Pick<ChartOfAccount, 'accountKind' | 'level1'>,
): AccountBalanceNature {
  if (account.accountKind === ChartOfAccountKind.PARTY_RECEIVABLE) {
    return 'DEBIT';
  }
  if (account.accountKind === ChartOfAccountKind.PARTY_PAYABLE) {
    return 'CREDIT';
  }

  // 1 = Assets, 5 = Expenses → debit nature; 2,3,4 → credit nature
  if (account.level1 === 1 || account.level1 === 5) {
    return 'DEBIT';
  }

  return 'CREDIT';
}

/** Signed movement added to running currentBalance for this account. */
export function computeBalanceMovement(
  nature: AccountBalanceNature,
  debitAmount: number,
  creditAmount: number,
): number {
  if (nature === 'DEBIT') {
    return debitAmount - creditAmount;
  }
  return creditAmount - debitAmount;
}
