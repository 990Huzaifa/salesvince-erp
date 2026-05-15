import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';
import { Party } from './party.entity';

export enum ChartOfAccountKind {
  SYSTEM = 'SYSTEM',
  PARTY_RECEIVABLE = 'PARTY_RECEIVABLE',
  PARTY_PAYABLE = 'PARTY_PAYABLE',
}

@Entity('chart_of_accounts')
@Index(['businessId', 'code'], { unique: true })
@Index(['businessId', 'partyId'])
@Index(['businessId', 'accountKind'])
export class ChartOfAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @ManyToOne(() => Business, (business) => business.chartOfAccounts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'uuid', nullable: true })
  partyId: string | null;

  @ManyToOne(() => Party, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'partyId' })
  party: Party | null;

  @Column({
    type: 'enum',
    enum: ChartOfAccountKind,
    default: ChartOfAccountKind.SYSTEM,
  })
  accountKind: ChartOfAccountKind;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ nullable: true })
  parentCode: string | null;

  @Column({ type: 'boolean', default: true })
  isPostable: boolean;

  @Column({ default: 0 })
  level1: number;

  @Column({ default: 0 })
  level2: number;

  @Column({ default: 0 })
  level3: number;

  @Column({ default: 0 })
  level4: number;

  @Column({ default: 0 })
  level5: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
