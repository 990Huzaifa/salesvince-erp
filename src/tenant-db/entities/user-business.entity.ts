import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Business } from './business.entity';
import { Role } from './role.entity';

export enum UserBusinessStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('user_businesses')
@Index(['userId', 'businessId'], { unique: true })
export class UserBusiness {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  businessId: string;

  @Column({ type: 'uuid' })
  roleId: string;

  @Column({
    type: 'enum',
    enum: UserBusinessStatus,
    default: UserBusinessStatus.ACTIVE,
  })
  status: UserBusinessStatus;

  @Column({ type: 'int', default: 1 })
  permissionVersion: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSelectedAt: Date | null;

  @ManyToOne(() => User, (user) => user.userBusinesses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Business, (business) => business.userBusinesses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @ManyToOne(() => Role, (role) => role.userBusinesses, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'roleId' })
  role: Role;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}