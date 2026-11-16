import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from './business.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { User } from './user.entity';

/** Lean sellable service (no UOM, warehouse, batch or purchase price). */
@Entity('services')
@Index(['businessId', 'name'])
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.services, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  /** Auto-generated, e.g. SRV-00001. */
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  saleUnitPrice: number;

  @Column({ type: 'uuid', nullable: true })
  chartOfAccountId: string | null;

  @ManyToOne(() => ChartOfAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'chartOfAccountId' })
  chartOfAccount: ChartOfAccount | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDelete: boolean;

  @Column({ name: 'createdBy', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
