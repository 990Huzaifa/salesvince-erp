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
import { SalaryComponent } from './salary-component.entity';
import {
  ComponentCalculationTypeEnum,
  ComponentTypeEnum,
} from './hr.enums';
import { Payslip } from './payslip.entity';

@Entity('payslip_lines')
@Index(['payslipId', 'salaryComponentId'], { unique: true })
export class PayslipLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  payslipId: string;

  @ManyToOne(() => Payslip, (payslip) => payslip.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payslipId' })
  payslip: Payslip;

  @Column({ type: 'uuid' })
  salaryComponentId: string;

  @ManyToOne(() => SalaryComponent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'salaryComponentId' })
  salaryComponent: SalaryComponent;

  @Column({ type: 'enum', enum: ComponentTypeEnum })
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
