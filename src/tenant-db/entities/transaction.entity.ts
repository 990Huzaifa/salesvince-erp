import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from './business.entity';
import { ChartOfAccount } from './chart-of-account.entity';

export enum AccountTransactionReferenceType {
  OPENING_BALANCE = 'OPENING_BALANCE',

  GRN = 'GRN',
  PURCHASE_INVOICE = 'PURCHASE_INVOICE',
  PURCHASE_RETURN = 'PURCHASE_RETURN',
  PURCHASE_RETURN_VOUCHER = 'PURCHASE_RETURN_VOUCHER',
  PAYMENT_VOUCHER = 'PAYMENT_VOUCHER',

  DELIVERY_NOTE = 'DELIVERY_NOTE',
  SALE_ORDER = 'SALE_ORDER',
  SALE_INVOICE = 'SALE_INVOICE',
  SALE_RETURN = 'SALE_RETURN',
  SALE_RETURN_VOUCHER = 'SALE_RETURN_VOUCHER',
  RECEIPT_VOUCHER = 'RECEIPT_VOUCHER',

  EXPENSE_VOUCHER = 'EXPENSE_VOUCHER',
  CONTRA_VOUCHER = 'CONTRA_VOUCHER',
  JOURNAL_VOUCHER = 'JOURNAL_VOUCHER',

  STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT',
  STOCK_DAMAGE = 'STOCK_DAMAGE',
  DAMAGE_WRITE_OFF = 'DAMAGE_WRITE_OFF',

  PAYSLIP = 'PAYSLIP',
  SALARY_VOUCHER = 'SALARY_VOUCHER',

  BUSINESS_LOAN = 'BUSINESS_LOAN',
  LOAN_RECEIPT_VOUCHER = 'LOAN_RECEIPT_VOUCHER',
  LOAN_PAYMENT_VOUCHER = 'LOAN_PAYMENT_VOUCHER',
  INTEREST_ACCRUAL_VOUCHER = 'INTEREST_ACCRUAL_VOUCHER',
}

@Entity('transactions')
  @Index(['businessId', 'chartOfAccountId'])
  @Index(['businessId', 'chartOfAccountId', 'createdAt'])
  @Index(['businessId', 'referenceType', 'referenceId'])
  @Index(['businessId', 'chartOfAccountId', 'transactionDate', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  chartOfAccountId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'chartOfAccountId' })
  chartOfAccount: ChartOfAccount;

  @Column({ type: 'enum', enum: AccountTransactionReferenceType })
  referenceType: AccountTransactionReferenceType;

  @Column({ type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ type: 'date' })
  transactionDate: Date;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  debitAmount: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  creditAmount: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  currentBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
