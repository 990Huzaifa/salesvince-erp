import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { VoucherStatus, PaymentMethod } from './voucher.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { Loan } from './loan.entity';

@Entity({ name: 'loan_receipt_vouchers' })
export class LoanReceiptVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  voucherNumber: string;

  @Column()
  loanId: string;

  @ManyToOne(() => Loan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @Column()
  accId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accId' })
  acc: ChartOfAccount;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

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
