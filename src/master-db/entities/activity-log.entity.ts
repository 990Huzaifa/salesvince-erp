import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PlatformUser } from './platform-user.entity';
import { Tenant } from './tenant.entity';

export enum ActivityLogActorType {
    PLATFORM_USER = 'PLATFORM_USER',
    SYSTEM = 'SYSTEM',
}

@Entity({ name: 'activity_logs' })
export class ActivityLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({
        type: 'enum',
        enum: ActivityLogActorType,
    })
    actorType: ActivityLogActorType;

    @Column({ type: 'uuid', nullable: true })
    actorId: string | null;

    @ManyToOne(() => PlatformUser, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'actorId' })
    actor: PlatformUser | null;

    @Column({ type: 'uuid', nullable: true })
    tenantId: string | null;

    @ManyToOne(() => Tenant, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant | null;

    @Column()
    action: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any> | null;

    @Column({nullable: true })
    jobId: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
