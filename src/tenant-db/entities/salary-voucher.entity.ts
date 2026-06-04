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
import { Employee } from './hr/employee.entity';
import { Payslip } from './hr/payslip.entity';
import { User } from './user.entity';
import { PaymentMethod, VoucherStatus } from './voucher.entity';

@Entity({ name: 'salary_vouchers' })
@Index(['businessId', 'payslipId'])
export class SalaryVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ unique: true })
  voucherNumber: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'uuid' })
  payslipId: string;

  @ManyToOne(() => Payslip, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payslipId' })
  payslip: Payslip;

  @Column()
  accId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accId' })
  acc: ChartOfAccount;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  chequeNumber: string | null;

  @Column({ nullable: true })
  chequeDate: Date | null;

  @Column({ nullable: true })
  bankName: string | null;

  @Column()
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  paymentAmount: number;

  @Column({ nullable: true })
  remarks: string | null;

  @Column({ nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
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
