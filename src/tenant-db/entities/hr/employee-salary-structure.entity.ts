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
import { PayPolicy } from './pay-policy.entity';
import { SalaryStructureStatusEnum } from './hr.enums';
import { EmployeeSalaryComponent } from './employee-salary-component.entity';

@Entity('employee_salary_structures')
@Index(['businessId', 'employeeId'])
@Index(['businessId', 'employeeId', 'status'])
export class EmployeeSalaryStructure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.employeeSalaryStructures, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, (employee) => employee.salaryStructures, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'uuid' })
  payPolicyId: string;

  @ManyToOne(() => PayPolicy, (payPolicy) => payPolicy.employeeSalaryStructures, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payPolicyId' })
  payPolicy: PayPolicy;

  @Column({ type: 'date' })
  effectiveFrom: Date;

  @Column({ type: 'date', nullable: true })
  effectiveTo: Date | null;

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
    enum: SalaryStructureStatusEnum,
    default: SalaryStructureStatusEnum.ACTIVE,
  })
  status: SalaryStructureStatusEnum;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(
    () => EmployeeSalaryComponent,
    (component) => component.employeeSalaryStructure,
  )
  components: EmployeeSalaryComponent[];
}
