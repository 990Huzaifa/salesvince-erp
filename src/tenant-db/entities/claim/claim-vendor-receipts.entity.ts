import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { Party } from '../party.entity';
import { Product, ProductFlavour, Uom } from '../product.entity';
import { User } from '../user.entity';
import { Warehouse } from '../warehouse.entity';
import { ClaimDiscardReason } from './claim-discard-reasons.entity';
import {
  Claim,
  ClaimBatch,
  ClaimItem,
} from './claim.entity';
import { ClaimVendorShipmentItem } from './claim-vendor-shipments.entity';

export enum ClaimDiscardType {
  AS_IS = 'AS_IS',
  SCRAP = 'SCRAP',
}

export enum ClaimSettlementType {
  REPLACEMENT = 'REPLACEMENT',
  REPAIRED = 'REPAIRED',
  CREDIT = 'CREDIT',
}
export enum ClaimVendorReceiptDocStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

/** Receive-from-vendor document — Accepted + Rejected ≤ At vendor. */
@Entity('claim_vendor_receipts')
export class ClaimVendorReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  receiptNumber: string;

  @Column({ type: 'date' })
  receiptDate: Date;

  @ManyToOne(() => Claim, (claim) => claim.vendorReceipts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @RelationId((row: ClaimVendorReceipt) => row.claim)
  claimId: string;

  @ManyToOne(() => Party, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'vendorId' })
  vendor: Party;

  @RelationId((row: ClaimVendorReceipt) => row.vendor)
  vendorId: string;

  /** Receive-at location (defaults to sending location). */
  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((row: ClaimVendorReceipt) => row.warehouse)
  warehouseId: string;

  @Column({
    type: 'enum',
    enum: ClaimVendorReceiptDocStatus,
    default: ClaimVendorReceiptDocStatus.PENDING,
  })
  status: ClaimVendorReceiptDocStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  proofImage: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @RelationId((row: ClaimVendorReceipt) => row.createdByUser)
  createdBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClaimVendorReceiptItem, (item) => item.receipt)
  items: ClaimVendorReceiptItem[];
}

@Entity('claim_vendor_receipt_items')
export class ClaimVendorReceiptItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClaimVendorReceipt, (receipt) => receipt.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'receiptId' })
  receipt: ClaimVendorReceipt;

  @RelationId((row: ClaimVendorReceiptItem) => row.receipt)
  receiptId: string;

  @ManyToOne(() => ClaimItem, (item) => item.receiptItems, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimItemId' })
  claimItem: ClaimItem;

  @RelationId((row: ClaimVendorReceiptItem) => row.claimItem)
  claimItemId: string;

  @ManyToOne(() => ClaimBatch, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'claimBatchId' })
  claimBatch: ClaimBatch | null;

  @RelationId((row: ClaimVendorReceiptItem) => row.claimBatch)
  claimBatchId: string | null;

  /** Optional link back to the outbound shipment line. */
  @ManyToOne(() => ClaimVendorShipmentItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shipmentItemId' })
  shipmentItem: ClaimVendorShipmentItem | null;

  @RelationId((row: ClaimVendorReceiptItem) => row.shipmentItem)
  shipmentItemId: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((row: ClaimVendorReceiptItem) => row.warehouse)
  warehouseId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((row: ClaimVendorReceiptItem) => row.product)
  productId: string;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @RelationId((row: ClaimVendorReceiptItem) => row.productFlavour)
  productFlavourId: string | null;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @RelationId((row: ClaimVendorReceiptItem) => row.uom)
  uomId: string;

  @Column({ type: 'int', default: 0 })
  acceptedQuantity: number;

  @Column({ type: 'int', default: 0 })
  rejectedQuantity: number;

  /** Per accepted qty — Replacement / Repaired / Credit. */
  @Column({
    type: 'enum',
    enum: ClaimSettlementType,
    nullable: true,
  })
  returnType: ClaimSettlementType | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  creditAmount: string | null;

  @ManyToOne(() => ClaimDiscardReason, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'rejectReasonId' })
  rejectReasonRef: ClaimDiscardReason | null;

  @RelationId((row: ClaimVendorReceiptItem) => row.rejectReasonRef)
  rejectReasonId: string | null;

  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({
    type: 'enum',
    enum: ClaimDiscardType,
    nullable: true,
  })
  rejectedAction: ClaimDiscardType | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
