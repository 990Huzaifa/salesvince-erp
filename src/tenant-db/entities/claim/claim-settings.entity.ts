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
import { Business } from '../business.entity';

/**
 * One row per business — aging bands + alert day thresholds.
 */
@Entity('claim_settings')
export class ClaimSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @RelationId((row: ClaimSettings) => row.business)
  businessId: string;

  /** Days before "stuck at vendor" alert. */
  @Column({ type: 'int', default: 15 })
  stuckAtVendorDays: number;

  /** Days before "waiting to give" alert. */
  @Column({ type: 'int', default: 15 })
  waitingToGiveDays: number;

  /** Aging band edges, e.g. [15, 30, 60] → 0-15, 16-30, 31-60, 60+. */
  @Column({ type: 'simple-json', default: '[15,30,60]' })
  agingBandDays: number[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
