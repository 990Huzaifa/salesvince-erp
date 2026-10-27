import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from './business.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { Warehouse } from './warehouse.entity';
import { PaymentMethod } from './voucher.entity';

/**
 * One row per business — operational defaults for forms / PDFs.
 * Cross-DB refs (document template, geo) are plain UUIDs (no FK).
 * Use `extras` jsonb for future keys without a migration every time.
 */
@Entity('business_settings')
@Unique('UQ_business_settings_businessId', ['businessId'])
export class BusinessSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @RelationId((row: BusinessSettings) => row.business)
  businessId: string;

  /** Default payment method on vouchers (CASH, CHEQUE, …). */
  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  defaultPaymentMethod: PaymentMethod | null;

  /** Default cash/bank COA used when posting voucher payments. */
  @Column({ type: 'uuid', nullable: true })
  defaultVoucherPaymentCoaId: string | null;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'defaultVoucherPaymentCoaId' })
  defaultVoucherPaymentCoa: ChartOfAccount | null;

  /** Master `document_templates.id` — selected pack for this business. */
  @Column({ type: 'uuid', nullable: true })
  defaultDocumentTemplateId: string | null;

  @Column({ type: 'uuid', nullable: true })
  defaultWarehouseId: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'defaultWarehouseId' })
  defaultWarehouse: Warehouse | null;

  /** Master geo IDs — UI options come from geo fence after platform policy. */
  @Column({ type: 'uuid', nullable: true })
  defaultCountryId: string | null;

  @Column({ type: 'uuid', nullable: true })
  defaultStateId: string | null;

  @Column({ type: 'uuid', nullable: true })
  defaultCityId: string | null;

  /** Forward-compatible bag for new defaults without schema churn. */
  @Column({ type: 'jsonb', nullable: true })
  extras: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
