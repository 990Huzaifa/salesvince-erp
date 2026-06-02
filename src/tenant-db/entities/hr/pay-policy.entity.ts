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
import { ChartOfAccount } from '../chart-of-account.entity';
import { Employee } from './employee.entity';
import {
  OvertimeRateTypeEnum,
  PayCycleEnum,
  PayrollTypeEnum,
  SalaryCalculationTypeEnum,
  WorkingDaysTypeEnum,
} from './hr.enums';
import { PayPolicyComponent } from './pay-policy-component.entity';
import { EmployeeSalaryStructure } from './employee-salary-structure.entity';

@Entity('pay_policies')
@Index(['businessId', 'code'], { unique: true })
@Index(['businessId', 'name'], { unique: true })
export class PayPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.payPolicies, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: PayrollTypeEnum,
    default: PayrollTypeEnum.MONTHLY,
  })
  payrollType: PayrollTypeEnum;

  @Column({
    type: 'enum',
    enum: PayCycleEnum,
    default: PayCycleEnum.MONTHLY,
  })
  payCycle: PayCycleEnum;

  @Column({
    type: 'enum',
    enum: SalaryCalculationTypeEnum,
    default: SalaryCalculationTypeEnum.FIXED,
  })
  salaryCalculationType: SalaryCalculationTypeEnum;

  @Column({
    type: 'enum',
    enum: WorkingDaysTypeEnum,
    default: WorkingDaysTypeEnum.FIXED_DAYS,
  })
  workingDaysType: WorkingDaysTypeEnum;

  @Column({ type: 'int', nullable: true })
  fixedWorkingDays: number | null;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  workingHoursPerDay: number | null;

  @Column({ type: 'varchar', length: 10, default: 'PKR' })
  currency: string;

  @Column({ type: 'boolean', default: false })
  overtimeAllowed: boolean;

  @Column({
    type: 'enum',
    enum: OvertimeRateTypeEnum,
    nullable: true,
  })
  overtimeRateType: OvertimeRateTypeEnum | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  overtimeRate: number | null;

  @Column({ type: 'boolean', default: false })
  lateDeductionAllowed: boolean;

  @Column({ type: 'boolean', default: true })
  absentDeductionAllowed: boolean;

  @Column({ type: 'boolean', default: true })
  halfDayDeductionAllowed: boolean;

  @Column({ type: 'boolean', default: false })
  taxApplicable: boolean;

  @Column({ type: 'boolean', default: false })
  providentFundApplicable: boolean;

  @Column({ type: 'boolean', default: false })
  eobiApplicable: boolean;

  @Column({ type: 'boolean', default: false })
  socialSecurityApplicable: boolean;

  @Column({ type: 'uuid', nullable: true })
  expenseAccountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'expenseAccountId' })
  expenseAccount: ChartOfAccount | null;

  @Column({ type: 'uuid', nullable: true })
  payableAccountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payableAccountId' })
  payableAccount: ChartOfAccount | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => PayPolicyComponent, (component) => component.payPolicy)
  payPolicyComponents: PayPolicyComponent[];

  @OneToMany(() => Employee, (employee) => employee.payPolicy)
  employees: Employee[];

  @OneToMany(() => EmployeeSalaryStructure, (structure) => structure.payPolicy)
  employeeSalaryStructures: EmployeeSalaryStructure[];
}
