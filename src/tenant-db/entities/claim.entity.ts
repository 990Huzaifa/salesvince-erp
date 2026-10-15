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
  RelationId,
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

/**
 * FK rule for this file: one owner only.
 * - Relation uses @ManyToOne + @JoinColumn (DB column + FK)
 * - Id exposed via @RelationId (read helper — NOT a second @Column)
 * Never pair @Column('xId') with @JoinColumn({ name: 'xId' }).
 */

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @RelationId((claim: Claim) => claim.business)
  businessId: string;

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
  @ManyToOne(() => Party, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'partyId' })
  party: Party | null;

  @RelationId((claim: Claim) => claim.party)
  partyId: string | null;

  /** Own warehouse/showroom when sourceType = OWN_LOCATION */
  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse | null;

  @RelationId((claim: Claim) => claim.warehouse)
  warehouseId: string | null;

  /** Set when claim is sent to vendor */
  @ManyToOne(() => Party, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'vendorId' })
  vendor: Party | null;

  @RelationId((claim: Claim) => claim.vendor)
  vendorId: string | null;

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

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @RelationId((claim: Claim) => claim.createdByUser)
  createdBy: string | null;

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

  @ManyToOne(() => Claim, (claim) => claim.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @RelationId((item: ClaimItem) => item.claim)
  claimId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((item: ClaimItem) => item.product)
  productId: string;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @RelationId((item: ClaimItem) => item.productFlavour)
  productFlavourId: number | null;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @RelationId((item: ClaimItem) => item.uom)
  uomId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((item: ClaimItem) => item.warehouse)
  warehouseId: string;

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

  @ManyToOne(() => Business, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @RelationId((batch: ClaimBatch) => batch.business)
  businessId: string;

  @ManyToOne(() => Claim, (claim) => claim.batches, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @RelationId((batch: ClaimBatch) => batch.claim)
  claimId: string;

  @ManyToOne(() => ClaimItem, (item) => item.batches, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimItemId' })
  claimItem: ClaimItem;

  @RelationId((batch: ClaimBatch) => batch.claimItem)
  claimItemId: string;

  @Column()
  batchNumber: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((batch: ClaimBatch) => batch.product)
  productId: string;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @RelationId((batch: ClaimBatch) => batch.productFlavour)
  productFlavourId: number | null;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @RelationId((batch: ClaimBatch) => batch.uom)
  uomId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((batch: ClaimBatch) => batch.warehouse)
  warehouseId: string;

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

  @ManyToOne(() => Business, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @RelationId((stock: ClaimStock) => stock.business)
  businessId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((stock: ClaimStock) => stock.warehouse)
  warehouseId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((stock: ClaimStock) => stock.product)
  productId: string;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @RelationId((stock: ClaimStock) => stock.uom)
  uomId: string;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @RelationId((stock: ClaimStock) => stock.productFlavour)
  productFlavourId: number | null;

  @Column({ type: 'int', default: 0 })
  quantityOnHand: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
