import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DatabaseBackupStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum DatabaseBackupTrigger {
  SCHEDULED = 'scheduled',
  MANUAL = 'manual',
}

@Entity('database_backups')
export class DatabaseBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  backupDate: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  s3Key: string | null;

  @Column({ type: 'bigint', nullable: true })
  fileSize: string | null;

  @Column({
    type: 'enum',
    enum: DatabaseBackupStatus,
    default: DatabaseBackupStatus.PENDING,
  })
  status: DatabaseBackupStatus;

  @Column({
    type: 'enum',
    enum: DatabaseBackupTrigger,
  })
  trigger: DatabaseBackupTrigger;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
