import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from '../business.entity';
import { Employee } from './employee.entity';
import { EmployeeSalaryStructure } from './employee-salary-structure.entity';
import { SalaryComponent } from './salary-component.entity';
import {
  ComponentCalculationTypeEnum,
  ComponentTypeEnum,
} from './hr.enums';

@Entity('employee_salary_components')
@Index(['employeeSalaryStructureId', 'salaryComponentId'], { unique: true })
export class EmployeeSalaryComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  employeeSalaryStructureId: string;

  @ManyToOne(
    () => EmployeeSalaryStructure,
    (structure) => structure.components,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'employeeSalaryStructureId' })
  employeeSalaryStructure: EmployeeSalaryStructure;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, (employee) => employee.salaryComponents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'uuid' })
  salaryComponentId: string;

  @ManyToOne(
    () => SalaryComponent,
    (salaryComponent) => salaryComponent.employeeSalaryComponents,
    { onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'salaryComponentId' })
  salaryComponent: SalaryComponent;

  @Column({
    type: 'enum',
    enum: ComponentTypeEnum,
  })
  componentType: ComponentTypeEnum;

  @Column({
    type: 'enum',
    enum: ComponentCalculationTypeEnum,
    default: ComponentCalculationTypeEnum.FIXED,
  })
  calculationType: ComponentCalculationTypeEnum;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  value: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  calculatedAmount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
