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
import { Product, ProductFlavour, Uom } from '../product.entity';
import { User } from '../user.entity';
import { Warehouse } from '../warehouse.entity';
import { ClaimDiscardReason } from './claim-discard-reasons.entity';
import { Claim, ClaimBatch, ClaimItem } from './claim.entity';

export enum ClaimDiscardDocStatus {
  PENDING = 'PENDING',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum ClaimDiscardType {
    AS_IS = 'AS_IS',
    SCRAP = 'SCRAP',
  }

/** Discard document — qty taken from To-send (before / instead of vendor). */
@Entity('claim_discards')
export class ClaimDiscard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  discardNumber: string;

  @Column({ type: 'date' })
  discardDate: Date;

  @ManyToOne(() => Claim, (claim) => claim.discards, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @RelationId((row: ClaimDiscard) => row.claim)
  claimId: string;

  @Column({
    type: 'enum',
    enum: ClaimDiscardDocStatus,
    default: ClaimDiscardDocStatus.PENDING,
  })
  status: ClaimDiscardDocStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @RelationId((row: ClaimDiscard) => row.createdByUser)
  createdBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClaimDiscardItem, (item) => item.discard)
  items: ClaimDiscardItem[];
}

@Entity('claim_discard_items')
export class ClaimDiscardItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClaimDiscard, (discard) => discard.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'discardId' })
  discard: ClaimDiscard;

  @RelationId((row: ClaimDiscardItem) => row.discard)
  discardId: string;

  @ManyToOne(() => ClaimItem, (item) => item.discardItems, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimItemId' })
  claimItem: ClaimItem;

  @RelationId((row: ClaimDiscardItem) => row.claimItem)
  claimItemId: string;

  @ManyToOne(() => ClaimBatch, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'claimBatchId' })
  claimBatch: ClaimBatch | null;

  @RelationId((row: ClaimDiscardItem) => row.claimBatch)
  claimBatchId: string | null;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @RelationId((row: ClaimDiscardItem) => row.warehouse)
  warehouseId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @RelationId((row: ClaimDiscardItem) => row.product)
  productId: string;

  @ManyToOne(() => ProductFlavour, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @RelationId((row: ClaimDiscardItem) => row.productFlavour)
  productFlavourId: string | null;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @RelationId((row: ClaimDiscardItem) => row.uom)
  uomId: string;

  @Column({ type: 'int' })
  quantity: number;

  @ManyToOne(() => ClaimDiscardReason, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'discardReasonId' })
  discardReasonRef: ClaimDiscardReason | null;

  @RelationId((row: ClaimDiscardItem) => row.discardReasonRef)
  discardReasonId: string | null;

  /** Free-text fallback when master reason not used. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({
    type: 'enum',
    enum: ClaimDiscardType,
    default: ClaimDiscardType.AS_IS,
  })
  action: ClaimDiscardType;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
