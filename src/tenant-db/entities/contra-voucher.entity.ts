import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { VoucherStatus, PaymentMethod } from "./voucher.entity";
import { ChartOfAccount } from "./chart-of-account.entity";

@Entity({ name: 'contra_vouchers' })
export class ContraVoucher {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    voucherNumber: string;

    @Column()
    fromAccId: string;

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'fromAccId' })
    fromAcc: ChartOfAccount;

    @Column()
    toAccId: string

    @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'toAccId' })
    toAcc: ChartOfAccount;

    @Column({ type: 'enum', enum: PaymentMethod })
    paymentMethod: PaymentMethod;

    // if payment method is CHEQUE, then add cheque number, cheque date, and bank name
    @Column({ nullable: true })
    chequeNumber: string;

    @Column({ nullable: true })
    chequeDate: Date;

    @Column({ nullable: true })
    bankName: string;

    @Column()
    paymentDate: Date;

    @Column({ type: 'decimal', precision: 20, scale: 2 })
    paymentAmount: number;

    @Column({ nullable: true })
    remarks: string;

    @Column({ nullable: true })
    createdBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User | null;  

    @Column({
        type: 'enum',
        enum: VoucherStatus,
        default: VoucherStatus.PENDING,
    })
    status: VoucherStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}