import { EntityTarget, ObjectLiteral } from 'typeorm';
import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { JournalLineInput } from '../transaction.service';
import {
  PaymentMethod,
  VoucherStatus,
} from 'src/tenant-db/entities/voucher.entity';

/** Shared payment fields for create / full validation payloads. */
export type VoucherPaymentPayload = {
  /** Set by service on create; not accepted from API input. */
  voucherNumber?: string;
  paymentMethod: PaymentMethod | string;
  paymentDate: string | Date;
  paymentAmount: number;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
  remarks?: string;
};

export type PartyVoucherPayload = VoucherPaymentPayload & {
  partyId: string;
  accId: string;
  invoiceId?: string;
};

export type ExpenseVoucherPayload = VoucherPaymentPayload & {
  expenseAccId: string;
  accId: string;
};

export type ContraVoucherPayload = VoucherPaymentPayload & {
  fromAccId: string;
  toAccId: string;
};

export type LoanReceiptVoucherPayload = VoucherPaymentPayload & {
  loanId: string;
  accId: string;
};

export type LoanPaymentVoucherPayload = VoucherPaymentPayload & {
  loanId: string;
  accId: string;
  principalAmount: number;
  interestAmount: number;
  feeAmount: number;
  penaltyAmount: number;
};

export type VoucherCreatePayload =
  | PartyVoucherPayload
  | ExpenseVoucherPayload
  | ContraVoucherPayload
  | LoanReceiptVoucherPayload
  | LoanPaymentVoucherPayload;

/** API / service input before voucher number is assigned. */
export type VoucherCreateInput = Omit<VoucherCreatePayload, 'voucherNumber'>;

/** Partial update — all variant-specific fields optional in one flat shape. */
export type VoucherUpdatePayload = Partial<VoucherPaymentPayload> & {
  partyId?: string;
  accId?: string;
  invoiceId?: string;
  expenseAccId?: string;
  fromAccId?: string;
  toAccId?: string;
  loanId?: string;
  principalAmount?: number;
  interestAmount?: number;
  feeAmount?: number;
  penaltyAmount?: number;
};

export type VoucherEntity = ObjectLiteral & {
  id: string;
  voucherNumber: string;
  paymentMethod: string;
  chequeNumber?: string | null;
  chequeDate?: Date | null;
  bankName?: string | null;
  paymentDate: Date;
  paymentAmount: number;
  remarks?: string | null;
  createdBy?: string | null;
  status: VoucherStatus;
  partyId?: string;
  accId?: string;
  expenseAccId?: string;
  fromAccId?: string;
  toAccId?: string;
  invoiceId?: string | null;
  loanId?: string;
  principalAmount?: number;
  interestAmount?: number;
  feeAmount?: number;
  penaltyAmount?: number;
};

export type VoucherListOptions = {
  page: number;
  limit: number;
  search?: string;
  status?: VoucherStatus;
};

export type VoucherConfig<T extends VoucherEntity> = {
  entity: EntityTarget<T>;
  referenceType: AccountTransactionReferenceType;
  activityKey: string;
  permissionKey: string;
  numberPrefix: string;
  hasParty: boolean;
  buildJournalLines: (voucher: T, partyLedgerAccountId?: string) => JournalLineInput[];
};
