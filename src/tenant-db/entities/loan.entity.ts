import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ChartOfAccount } from './chart-of-account.entity';
import { Business } from './business.entity';

export enum LoanStatus {
    DRAFT = 'DRAFT',
    APPROVED = 'APPROVED',
    ACTIVE = 'ACTIVE',
    PARTIALLY_PAID = 'PARTIALLY_PAID',
    CLOSED = 'CLOSED',
    CANCELLED = 'CANCELLED',
}

export enum LoanType {
    BANK = 'BANK',
    PERSON = 'PERSON',
    COMPANY = 'COMPANY',
    DIRECTOR = 'DIRECTOR',
    PARTNER = 'PARTNER',
    OTHER = 'OTHER',
}

/** How interest is expressed: rate (%) or a fixed monetary amount. */
export enum LoanInterestType {
    PERCENT = 'PERCENT',
    FIXED = 'FIXED',
}

export enum InstallmentFrequency {
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
    QUARTERLY = 'QUARTERLY',
    CUSTOM = 'CUSTOM',
}

@Entity('loans')
export class Loan {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    loanName: string;

    @Column({
        type: 'enum',
        enum: LoanType,
        default: LoanType.OTHER,
    })
    loanType: LoanType;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column({ unique: true })
    loanNumber: string;

    @Column()
    loanAccId: string;

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'loanAccId' })
    loanAcc: ChartOfAccount;

    @Column()
    receivingAccId: string;

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'receivingAccId' })
    receivingAcc: ChartOfAccount;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    @Column({ type: 'decimal', precision: 20, scale: 2 })
    principalAmount: number;

    @Column({
        type: 'enum',
        enum: LoanInterestType,
        default: LoanInterestType.PERCENT,
    })
    interestType: LoanInterestType;

    /** PERCENT: annual rate (e.g. 12.5 = 12.5%). FIXED: total interest amount. */
    @Column({ type: 'decimal', precision: 20, scale: 4, default: 0 })
    interestValue: number;

    @Column({
        type: 'enum',
        enum: InstallmentFrequency,
        default: InstallmentFrequency.MONTHLY,
    })
    installmentFrequency: InstallmentFrequency;

    /** Required when installmentFrequency is CUSTOM (interval in days). */
    @Column({ type: 'int', nullable: true })
    customInstallmentIntervalDays: number | null;

    @Column({
        type: 'enum',
        enum: LoanStatus,
        default: LoanStatus.DRAFT,
    })
    status: LoanStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;
}
