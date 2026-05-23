import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { PurchaseVoucher } from 'src/tenant-db/entities/purchase-voucher.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import { PurchaseReturnVoucher } from 'src/tenant-db/entities/purchase-return-voucher.entity';
import { SaleReturnVoucher } from 'src/tenant-db/entities/sale-return-voucher.entity';
import { ExpenseVoucher } from 'src/tenant-db/entities/expense-voucher.entity';
import { ContraVoucher } from 'src/tenant-db/entities/contra-voucher.entity';
import { VoucherConfig } from './voucher.types';

const amountLines = (
  debitAccountId: string,
  creditAccountId: string,
  amount: number,
  description: string,
) => [
  {
    chartOfAccountId: debitAccountId,
    debitAmount: amount,
    description,
  },
  {
    chartOfAccountId: creditAccountId,
    creditAmount: amount,
    description,
  },
];

export const PURCHASE_VOUCHER_CONFIG: VoucherConfig<PurchaseVoucher> = {
  entity: PurchaseVoucher,
  referenceType: AccountTransactionReferenceType.PAYMENT_VOUCHER,
  activityKey: 'PURCHASE_VOUCHER',
  permissionKey: 'PURCHASE_VOUCHER',
  numberPrefix: 'PV',
  hasParty: true,
  buildJournalLines: (voucher, partyLedgerAccountId) =>
    amountLines(
      partyLedgerAccountId!,
      voucher.accId,
      Number(voucher.paymentAmount),
      `Payment to vendor - ${voucher.voucherNumber}`,
    ),
};

export const SALE_VOUCHER_CONFIG: VoucherConfig<SaleVoucher> = {
  entity: SaleVoucher,
  referenceType: AccountTransactionReferenceType.RECEIPT_VOUCHER,
  activityKey: 'SALE_VOUCHER',
  permissionKey: 'SALE_VOUCHER',
  numberPrefix: 'RV',
  hasParty: true,
  buildJournalLines: (voucher, partyLedgerAccountId) =>
    amountLines(
      voucher.accId,
      partyLedgerAccountId!,
      Number(voucher.paymentAmount),
      `Receipt from customer - ${voucher.voucherNumber}`,
    ),
};

export const PURCHASE_RETURN_VOUCHER_CONFIG: VoucherConfig<PurchaseReturnVoucher> =
  {
    entity: PurchaseReturnVoucher,
    referenceType: AccountTransactionReferenceType.PURCHASE_RETURN_VOUCHER,
    activityKey: 'PURCHASE_RETURN_VOUCHER',
    permissionKey: 'PURCHASE_RETURN_VOUCHER',
    numberPrefix: 'PRV',
    hasParty: true,
    buildJournalLines: (voucher, partyLedgerAccountId) =>
      amountLines(
        voucher.accId,
        partyLedgerAccountId!,
        Number(voucher.paymentAmount),
        `Purchase return receipt - ${voucher.voucherNumber}`,
      ),
  };

export const SALE_RETURN_VOUCHER_CONFIG: VoucherConfig<SaleReturnVoucher> = {
  entity: SaleReturnVoucher,
  referenceType: AccountTransactionReferenceType.SALE_RETURN_VOUCHER,
  activityKey: 'SALE_RETURN_VOUCHER',
  permissionKey: 'SALE_RETURN_VOUCHER',
  numberPrefix: 'SRV',
  hasParty: true,
  buildJournalLines: (voucher, partyLedgerAccountId) =>
    amountLines(
      partyLedgerAccountId!,
      voucher.accId,
      Number(voucher.paymentAmount),
      `Sale return payment - ${voucher.voucherNumber}`,
    ),
};

export const EXPENSE_VOUCHER_CONFIG: VoucherConfig<ExpenseVoucher> = {
  entity: ExpenseVoucher,
  referenceType: AccountTransactionReferenceType.EXPENSE_VOUCHER,
  activityKey: 'EXPENSE_VOUCHER',
  permissionKey: 'EXPENSE_VOUCHER',
  numberPrefix: 'EV',
  hasParty: false,
  buildJournalLines: (voucher) =>
    amountLines(
      voucher.expenseAccId,
      voucher.accId,
      Number(voucher.paymentAmount),
      `Expense - ${voucher.voucherNumber}`,
    ),
};

export const CONTRA_VOUCHER_CONFIG: VoucherConfig<ContraVoucher> = {
  entity: ContraVoucher,
  referenceType: AccountTransactionReferenceType.CONTRA_VOUCHER,
  activityKey: 'CONTRA_VOUCHER',
  permissionKey: 'CONTRA_VOUCHER',
  numberPrefix: 'CV',
  hasParty: false,
  buildJournalLines: (voucher) =>
    amountLines(
      voucher.toAccId,
      voucher.fromAccId,
      Number(voucher.paymentAmount),
      `Contra transfer - ${voucher.voucherNumber}`,
    ),
};
