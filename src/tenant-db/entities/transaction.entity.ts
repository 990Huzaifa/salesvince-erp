import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Business } from "./business.entity";

export enum AccountTransactionReferenceType {
    OPENING_BALANCE = 'OPENING_BALANCE',

    GRN = 'GRN',
    PURCHASE_INVOICE = 'PURCHASE_INVOICE',
    PURCHASE_RETURN = 'PURCHASE_RETURN',
    PURCHASE_RETURN_VOUCHER = 'PURCHASE_RETURN_VOUCHER',
    PAYMENT_VOUCHER = 'PAYMENT_VOUCHER',

    DELIVERY_NOTE = 'DELIVERY_NOTE',
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

    @Column({ type: 'enum', enum: AccountTransactionReferenceType })
    referenceType: AccountTransactionReferenceType;

    @Column()
    transactionDate: Date;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    debitAmount: number;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    creditAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}