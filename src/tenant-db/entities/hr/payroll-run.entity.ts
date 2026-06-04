import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../business.entity';
import { PayPolicy } from './pay-policy.entity';
import { PayrollRunStatusEnum } from './hr.enums';
import { Payslip } from './payslip.entity';

@Entity('payroll_runs')
@Index(['businessId', 'periodYear', 'periodMonth'], { unique: true })
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'int' })
  periodYear: number;

  @Column({ type: 'int' })
  periodMonth: number;

  @Column({ type: 'uuid', nullable: true })
  payPolicyId: string | null;

  @ManyToOne(() => PayPolicy, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payPolicyId' })
  payPolicy: PayPolicy | null;

  @Column({
    type: 'enum',
    enum: PayrollRunStatusEnum,
    default: PayrollRunStatusEnum.DRAFT,
  })
  status: PayrollRunStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => Payslip, (payslip) => payslip.payrollRun)
  payslips: Payslip[];
}
