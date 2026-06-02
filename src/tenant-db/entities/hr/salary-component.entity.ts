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
import {
  ComponentCalculationTypeEnum,
  ComponentTypeEnum,
} from './hr.enums';
import { PayPolicyComponent } from './pay-policy-component.entity';
import { EmployeeSalaryComponent } from './employee-salary-component.entity';

@Entity('salary_components')
@Index(['businessId', 'code'], { unique: true })
@Index(['businessId', 'name'], { unique: true })
export class SalaryComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.salaryComponents, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

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

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  defaultValue: number | null;

  @Column({ type: 'boolean', default: false })
  isTaxable: boolean;

  @Column({ type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccount | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(
    () => PayPolicyComponent,
    (policyComponent) => policyComponent.salaryComponent,
  )
  payPolicyComponents: PayPolicyComponent[];

  @OneToMany(
    () => EmployeeSalaryComponent,
    (employeeComponent) => employeeComponent.salaryComponent,
  )
  employeeSalaryComponents: EmployeeSalaryComponent[];
}
