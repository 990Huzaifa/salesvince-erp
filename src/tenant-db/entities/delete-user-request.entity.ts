import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum DeleteUserRequestStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export type DeleteUserRequestBusinessSnapshot = {
  id: string;
  code: string;
  name: string;
};

@Entity('delete_user_requests')
export class DeleteUserRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.deleteUserRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text' })
  reason: string;

  /** Active business memberships at the time of the request. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  businesses: DeleteUserRequestBusinessSnapshot[];

  @Column({
    type: 'enum',
    enum: DeleteUserRequestStatus,
    default: DeleteUserRequestStatus.PENDING,
  })
  status: DeleteUserRequestStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
