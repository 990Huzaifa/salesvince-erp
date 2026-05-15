import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { TenantDbConfig } from './tenant-db-config.entity';
import { TenantProfile } from './tenant-profile.entity';
import { TenantModule } from './tenant-modules.entity';

export enum TenantStatus {
    REGISTERED = 'REGISTERED',
    PROVISIONING = 'PROVISIONING',
    PROVISIONED = 'PROVISIONED',
    FAILED = 'FAILED',
    SUSPENDED = 'SUSPENDED',
}
export enum IndustryType {
    SOFTWARE = 'SOFTWARE',
    RETAIL = 'RETAIL',
    SERVICES = 'SERVICES',
    BRAND = 'BRAND',
    MANUFACTURING = 'MANUFACTURING',
    WHOLESALE = 'WHOLESALE',
    OTHER = 'OTHER',
}

@Entity({ name: 'tenants' })
export class Tenant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string; // 🔐 auto-generated (6 digit)

    @Column({ unique: true })
    name: string;

    @Column({ unique: true })
    email: string;

    @Column({
        type: 'enum',
        enum: IndustryType,
        nullable: true,
    })
    industryType: IndustryType;

    @Column({ default: true })
    isActive: boolean;

    @Column({
        type: 'enum',
        enum: TenantStatus,
        default: TenantStatus.REGISTERED,
    })
    status: TenantStatus;

    @OneToOne(() => TenantDbConfig, (db) => db.tenant)
    dbConfig: TenantDbConfig;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToOne(() => TenantProfile, (profile) => profile.tenant, {
        eager: true,
    })
    profile: TenantProfile;

    @OneToMany(() => TenantModule, (module) => module.tenant)
    modules: TenantModule[];
}
