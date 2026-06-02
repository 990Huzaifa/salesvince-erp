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
import { PayPolicy } from './pay-policy.entity';
import { SalaryComponent } from './salary-component.entity';
import { ComponentCalculationTypeEnum } from './hr.enums';

@Entity('pay_policy_components')
@Index(['payPolicyId', 'salaryComponentId'], { unique: true })
export class PayPolicyComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  payPolicyId: string;

  @ManyToOne(() => PayPolicy, (payPolicy) => payPolicy.payPolicyComponents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payPolicyId' })
  payPolicy: PayPolicy;

  @Column({ type: 'uuid' })
  salaryComponentId: string;

  @ManyToOne(
    () => SalaryComponent,
    (salaryComponent) => salaryComponent.payPolicyComponents,
    { onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'salaryComponentId' })
  salaryComponent: SalaryComponent;

  @Column({
    type: 'enum',
    enum: ComponentCalculationTypeEnum,
    default: ComponentCalculationTypeEnum.MANUAL,
  })
  calculationType: ComponentCalculationTypeEnum;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  value: number | null;

  @Column({ type: 'uuid', nullable: true })
  basedOnComponentId: string | null;

  @ManyToOne(() => SalaryComponent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'basedOnComponentId' })
  basedOnComponent: SalaryComponent | null;

  @Column({ type: 'text', nullable: true })
  formula: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
