import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
} from 'typeorm';

import { PlatformUser } from './platform-user.entity';
import { Plan } from './plan.entity';
import { Tenant } from './tenant.entity';


// ================= ENUMS =================

export enum DisplayMode {
    BANNER = 'BANNER',
    MODAL = 'MODAL',
}

export enum Type {
    INFO = 'INFO',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    SUCCESS = 'SUCCESS',
}

export enum TargetScope {
    GLOBAL = 'GLOBAL',
    TENANT = 'TENANT',
    PLAN = 'PLAN',
}


// ================= MAIN ENTITY =================

@Entity({ name: 'announcements' })
export class Announcement {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column()
    message: string;

    @Column({ default: 1 })
    priority: number;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'enum', enum: DisplayMode, default: DisplayMode.BANNER })
    displayMode: DisplayMode;

    @Column({ type: 'enum', enum: Type, default: Type.INFO })
    type: Type;

    @Column({ type: 'enum', enum: TargetScope, default: TargetScope.GLOBAL })
    targetScope: TargetScope;

    @Column({ default: true })
    isDismissable: boolean;

    @Column({ type: 'timestamp', nullable: true })
    startsAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    endsAt: Date | null;

    // Who created announcement
    @ManyToOne(() => PlatformUser, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'created_by' })
    createdBy: PlatformUser | null;

    // PLAN targeting
    @OneToMany(() => AnnouncementPlan, (ap) => ap.announcement, {
        cascade: true,
    })
    announcement_plans: AnnouncementPlan[];

    // TENANT targeting
    @OneToMany(() => AnnouncementTenant, (at) => at.announcement, {
        cascade: true,
    })
    announcement_tenants: AnnouncementTenant[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}


// ================= PLAN TARGET =================

@Entity({ name: 'announcement_plans' })
export class AnnouncementPlan {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Announcement, (announcement) => announcement.announcement_plans, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'announcement_id' })
    announcement: Announcement;

    @Column({ type: 'int', nullable: true }) // nullable for GLOBAL
    plan_id: number | null;

    @ManyToOne(() => Plan, { nullable: true, eager: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan | null;
}


// ================= TENANT TARGET =================

@Entity({ name: 'announcement_tenants' })
export class AnnouncementTenant {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Announcement, (announcement) => announcement.announcement_tenants, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'announcement_id' })
    announcement: Announcement;

    @Column({ type: 'uuid', nullable: true }) // nullable for GLOBAL
    tenant_id: string | null;

    @ManyToOne(() => Tenant, { nullable: true, eager: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant | null;
}