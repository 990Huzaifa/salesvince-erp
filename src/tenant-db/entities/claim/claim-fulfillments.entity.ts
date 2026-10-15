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
import {
  Claim,
  ClaimBatch,
  ClaimItem,
} from './claim.entity';


export enum ClaimSettlementType {
    REPLACEMENT = 'REPLACEMENT',
    REPAIRED = 'REPAIRED',
    CREDIT = 'CREDIT',
  }
export enum ClaimFulfillmentType {
  DELIVER_TO_CUSTOMER = 'DELIVER_TO_CUSTOMER',
  RETURN_TO_LOCATION = 'RETURN_TO_LOCATION',
}

export enum ClaimFulfillmentDocStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

/** Deliver to customer / return to location — multi-lot document. */
@Entity('claim_fulfillments')
export class ClaimFulfillment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  fulfillmentNumber: string;

  @Column({ type: 'date' })
  fulfillmentDate: Date;

  @ManyToOne(() => Claim, (claim) => claim.fulfillments, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @RelationId((row: ClaimFulfillment) => row.claim)
  claimId: string;

  @Column({ type: 'enum', enum: ClaimFulfillmentType })
  type: ClaimFulfillmentType;

  @Column({
    type: 'enum',
    enum: ClaimFulfillmentDocStatus,
    default: ClaimFulfillmentDocStatus.PENDING,
  })
  status: ClaimFulfillmentDocStatus;

  /** Customer when DELIVER_TO_CUSTOMER (usually from claim.party). */
  @ManyToOne(() => Party, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'partyId' })
  party: Party | null;

  @RelationId((row: ClaimFulfillment) => row.party)
  partyId: string | null;

  /** Location when RETURN_TO_LOCATION. */
  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse | null;

  @RelationId((row: ClaimFulfillment) => row.warehouse)
  warehouseId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  receivedByName: string | null;

  @Column({ type: 'text', nullable: true })
  signatureImage: string | null;

  @Column({ type: 'text', nullable: true })
  proofImage: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @RelationId((row: ClaimFulfillment) => row.createdByUser)
  createdBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClaimFulfillmentItem, (item) => item.fulfillment)
  items: ClaimFulfillmentItem[];
}

@Entity('claim_fulfillment_items')
export class ClaimFulfillmentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClaimFulfillment, (f) => f.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'fulfillmentId' })
  fulfillment: ClaimFulfillment;

  @RelationId((row: ClaimFulfillmentItem) => row.fulfillment)
  fulfillmentId: string;

  @ManyToOne(() => ClaimItem, (item) => item.fulfillmentItems, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimItemId' })
  claimItem: ClaimItem;

  @RelationId((row: ClaimFulfillmentItem) => row.claimItem)
  claimItemId: string;

  @ManyToOne(() => ClaimBatch, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'claimBatchId' })
  claimBatch: ClaimBatch | null;

  @RelationId((row: ClaimFulfillmentItem) => row.claimBatch)
  claimBatchId: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((row: ClaimFulfillmentItem) => row.warehouse)
  warehouseId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((row: ClaimFulfillmentItem) => row.product)
  productId: string;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @RelationId((row: ClaimFulfillmentItem) => row.productFlavour)
  productFlavourId: string | null;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @RelationId((row: ClaimFulfillmentItem) => row.uom)
  uomId: string;

  /** Give qty — must be ≤ Ready to give. */
  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'enum',
    enum: ClaimSettlementType,
    nullable: true,
  })
  settlementType: ClaimSettlementType | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  creditAmount: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
