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
import { Employee } from './employee.entity';
import { EmployeeSalaryStructure } from './employee-salary-structure.entity';
import { PayrollRun } from './payroll-run.entity';
import { PayslipStatusEnum } from './hr.enums';
import { PayslipLine } from './payslip-line.entity';

@Entity('payslips')
@Index(['payrollRunId', 'employeeId'], { unique: true })
@Index(['businessId', 'employeeId'])
export class Payslip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  payrollRunId: string;

  @ManyToOne(() => PayrollRun, (run) => run.payslips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payrollRunId' })
  payrollRun: PayrollRun;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'uuid' })
  employeeSalaryStructureId: string;

  @ManyToOne(() => EmployeeSalaryStructure, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employeeSalaryStructureId' })
  employeeSalaryStructure: EmployeeSalaryStructure;

  @Column({ type: 'int' })
  periodYear: number;

  @Column({ type: 'int' })
  periodMonth: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  basicSalary: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  grossSalary: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalEarnings: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalDeductions: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  netSalary: number;

  @Column({ type: 'varchar', length: 10, default: 'PKR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PayslipStatusEnum,
    default: PayslipStatusEnum.DRAFT,
  })
  status: PayslipStatusEnum;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => PayslipLine, (line) => line.payslip)
  lines: PayslipLine[];
}
