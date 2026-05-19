import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from "typeorm";
import { User } from "./user.entity";
import { ChartOfAccount } from "./chart-of-account.entity";

export enum LoanStatus{
    DRAFT = 'DRAFT',
    APPROVED = 'APPROVED',
    ACTIVE = 'ACTIVE',
    PARTIALLY_PAID = 'PARTIALLY_PAID',
    CLOSED = 'CLOSED',
    CANCELLED = 'CANCELLED',
}

@Entity('loans')
export class Loan {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    loanNumber: string;

    @Column()
    loanAccId: string;

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'loanAccId' })
    loanAcc: ChartOfAccount;

    @Column()
    receivingAccId: string

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'receivingAccId' })
    receivingAcc: ChartOfAccount;

    @Column()
    startDate: Date;

    @Column()
    endDate: Date;

    // main part

    @Column({ type: 'decimal', precision: 20, scale: 2 })
    principalAmount: number;

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