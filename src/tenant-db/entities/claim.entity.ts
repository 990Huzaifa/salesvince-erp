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
import { Party } from './party.entity';
import { Product, ProductFlavour, Uom } from './product.entity';
import { User } from './user.entity';
import { Warehouse } from './warehouse.entity';

export enum ClaimSourceType {
  CUSTOMER = 'CUSTOMER',
  OWN_LOCATION = 'OWN_LOCATION',
}

export enum ClaimStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  VALIDATED = 'VALIDATED',
  INVALID_DISCARDED = 'INVALID_DISCARDED',
  SENT_TO_VENDOR = 'SENT_TO_VENDOR',
  RECEIVED_FROM_VENDOR = 'RECEIVED_FROM_VENDOR',
  VENDOR_ACCEPTED = 'VENDOR_ACCEPTED',
  VENDOR_REJECTED_DISCARD = 'VENDOR_REJECTED_DISCARD',
  DELIVERED_TO_CUSTOMER = 'DELIVERED_TO_CUSTOMER',
  RETURNED_TO_LOCATION = 'RETURNED_TO_LOCATION',
  CLOSED = 'CLOSED',
}

export enum ClaimItemUnitOutcome {
  PENDING = 'PENDING',
  VENDOR_ACCEPTED = 'VENDOR_ACCEPTED',
  VENDOR_REJECTED = 'VENDOR_REJECTED',
  DISCARDED = 'DISCARDED',
  DELIVERED = 'DELIVERED',
  RETURNED_TO_STOCK = 'RETURNED_TO_STOCK',
}

export enum ClaimDiscardType {
  AS_IS = 'AS_IS',
  SCRAP = 'SCRAP',
}

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ unique: true })
  claimNumber: string;

  @Column({ type: 'date' })
  claimDate: Date;

  @Column({
    type: 'enum',
    enum: ClaimSourceType,
  })
  sourceType: ClaimSourceType;

  /** Customer when sourceType = CUSTOMER */
  @Column({ type: 'uuid', nullable: true })
  partyId: string | null;

  @ManyToOne(() => Party, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'partyId' })
  party: Party | null;

  /** Own warehouse/showroom when sourceType = OWN_LOCATION */
  @Column({ type: 'uuid', nullable: true })
  warehouseId: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse | null;

  /** Set when claim is sent to vendor */
  @Column({ type: 'uuid', nullable: true })
  vendorId: string | null;

  @ManyToOne(() => Party, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'vendorId' })
  vendor: Party | null;

  @Column({
    type: 'enum',
    enum: ClaimStatus,
    default: ClaimStatus.DRAFT,
  })
  status: ClaimStatus;

  @Column({ type: 'boolean', nullable: true })
  isValid: boolean | null;

  @Column({ type: 'text', nullable: true })
  invalidReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClaimItem, (item) => item.claim)
  items: ClaimItem[];

  @OneToMany(() => ClaimBatch, (batch) => batch.claim)
  batches: ClaimBatch[];
}

@Entity('claim_items')
export class ClaimItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  claimId: string;

  @ManyToOne(() => Claim, (claim) => claim.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int', nullable: true })
  productFlavourId: number | null;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column({ type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @Column({ type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'int' })
  claimedQuantity: number;

  @Column({
    type: 'enum',
    enum: ClaimItemUnitOutcome,
    default: ClaimItemUnitOutcome.PENDING,
  })
  unitOutcome: ClaimItemUnitOutcome;

  @Column({
    type: 'enum',
    enum: ClaimDiscardType,
    nullable: true,
  })
  discardType: ClaimDiscardType | null;

  @Column({ type: 'text', nullable: true })
  discardReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // proof image

  @Column({ type: 'text', nullable: true })
  proofImage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClaimBatch, (batch) => batch.claimItem)
  batches: ClaimBatch[];
}

/**
 * Claim-module inventory only — not linked to ERP batchs / stock_balances.
 * Batch + stock-in happen on submit; later statuses reduce ClaimBatch + ClaimStock.
 */
@Entity('claim_batches')
export class ClaimBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @ManyToOne(() => Claim, (claim) => claim.batches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @Column({ type: 'uuid' })
  claimId: string;

  @Column({ type: 'uuid'})
  claimItemId: string;

  @ManyToOne(() => ClaimItem, (item) => item.batches, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'claimItemId' })
  claimItem: ClaimItem;

  @Column()
  batchNumber: string;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'int', nullable: true })
  productFlavourId: number | null;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column({ type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @Column({ type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  /** Remaining qty in this claim batch (drops on discard / deliver / return). */
  @Column({ type: 'int' })
  quantity: number;

  /** Original qty when batch was created from claim item. */
  @Column({ type: 'int' })
  originalQuantity: number;

  @Column({ type: 'date' })
  batchDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}

/**
 * Aggregated claim-module stock (separate from ERP stock_balances).
 */
@Entity('claim_stocks')
@Index(
  'IDX_claim_stocks_active_with_flavour',
  ['businessId', 'warehouseId', 'productId', 'uomId', 'productFlavourId'],
  {
    unique: true,
    where: '"deletedAt" IS NULL AND "productFlavourId" IS NOT NULL',
  },
)
@Index(
  'IDX_claim_stocks_active_without_flavour',
  ['businessId', 'warehouseId', 'productId', 'uomId'],
  {
    unique: true,
    where: '"deletedAt" IS NULL AND "productFlavourId" IS NULL',
  },
)
export class ClaimStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @Column({ type: 'int', nullable: true })
  productFlavourId: number | null;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column({ type: 'int', default: 0 })
  quantityOnHand: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
