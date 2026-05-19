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
import { Business } from './business.entity';
import { Grn } from './grn.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { PurchaseQuotation } from './purchase-quotation.entity';
import { Batch } from './stock.entity';

export enum PartyType {
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
  BOTH = 'BOTH',
}

export enum PartyClass {
  A = 'A',
  B = 'B',
  C = 'C',
}

@Entity('parties')
@Index(['businessId', 'code'], { unique: true })
export class Party {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.parties, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'uuid', nullable: true })
  receivableAccountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receivableAccountId' })
  receivableAccount: ChartOfAccount | null;

  @Column({ type: 'uuid', nullable: true })
  payableAccountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payableAccountId' })
  payableAccount: ChartOfAccount | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'enum', enum: PartyType })
  type: PartyType;

  @Column({ type: 'enum', enum: PartyClass, nullable: true })
  partyClass: PartyClass | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  whatsAppNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  alternatePhone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ntnNumber: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strnNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cnic: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  taxNumber: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({nullable: true})
  countryId: string | null;

  @Column({nullable: true})
  stateId: string | null;

  @Column({nullable: true})
  cityId: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  creditLimit: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  payableOpeningBalance: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  receivableOpeningBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;


  // relationships
  @OneToMany(() => PurchaseQuotation, (purchaseQuotation) => purchaseQuotation.vendor, { onDelete: 'CASCADE' })
  purchaseQuotations: PurchaseQuotation[];

  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.vendor, { onDelete: 'CASCADE' })
  purchaseOrders: PurchaseOrder[];
  
  @OneToMany(() => Grn, (grn) => grn.vendor, { onDelete: 'CASCADE' })
  grns: Grn[];

  @OneToMany(() => Batch, (batch) => batch.vendor, { onDelete: 'CASCADE' })
  batches: Batch[];
}
