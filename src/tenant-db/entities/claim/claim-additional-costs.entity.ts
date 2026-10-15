import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user.entity';
import { ClaimCostType } from './claim-cost-types.entity';
import { Claim } from './claim.entity';

export enum ClaimCostLinkedDocType {
  CLAIM = 'CLAIM',
  SHIPMENT = 'SHIPMENT',
  RECEIPT = 'RECEIPT',
  FULFILLMENT = 'FULFILLMENT',
  DISCARD = 'DISCARD',
}

export enum ClaimCostBorneBy {
  COMPANY = 'COMPANY',
  CUSTOMER = 'CUSTOMER',
  VENDOR = 'VENDOR',
}

/** Extra cost on any claim document step. */
@Entity('claim_additional_costs')
export class ClaimAdditionalCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  costNumber: string;

  @Column({ type: 'date' })
  costDate: Date;

  @ManyToOne(() => Claim, (claim) => claim.additionalCosts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @RelationId((row: ClaimAdditionalCost) => row.claim)
  claimId: string;

  @Column({ type: 'enum', enum: ClaimCostLinkedDocType })
  linkedDocType: ClaimCostLinkedDocType;

  /** UUID of claim / shipment / receipt / fulfillment / discard. */
  @Column({ type: 'uuid' })
  linkedDocId: string;

  @ManyToOne(() => ClaimCostType, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'costTypeId' })
  costType: ClaimCostType | null;

  @RelationId((row: ClaimAdditionalCost) => row.costType)
  costTypeId: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: string;

  @Column({ type: 'enum', enum: ClaimCostBorneBy })
  borneBy: ClaimCostBorneBy;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @RelationId((row: ClaimAdditionalCost) => row.createdByUser)
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
