import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PlatformUser } from './platform-user.entity';
import { Tenant } from './tenant.entity';
import { TenantWhatsappAccountTemplates } from './tenant_whatsapp_account_templates.entity';

export enum WhatsappProvider {
    META = 'META',
}

export enum TenantWhatsappAccountStatus {
    NUMBER_SAVED = 'NUMBER_SAVED',
    SETUP_STARTED = 'SETUP_STARTED',
    CONNECTED = 'CONNECTED',
    FAILED = 'FAILED',
    DISABLED = 'DISABLED',
}

@Entity({ name: 'tenant_whatsapp_accounts' })
export class TenantWhatsappAccounts {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tenantId: string;

    @ManyToOne(() => Tenant, (tenant) => tenant.whatsappAccounts, {onDelete: 'CASCADE',})
    @JoinColumn({ name: 'tenantId' })
    tenant: Tenant;

    @Column({
        type: 'enum',
        enum: WhatsappProvider,
        default: WhatsappProvider.META,
    })
    provider: WhatsappProvider;

    @Column()
    displayPhoneNumber: string;

    @Column()
    phoneCountryCode: string;

    @Column()
    phoneNationalNumber: string;

    @Column({ nullable: true })
    wabaId: string | null;

    @Column({ nullable: true })
    phoneNumberId: string | null;

    @Column({ nullable: true })
    businessAccountId: string | null;

    @Column({ type: 'text', nullable: true })
    accessToken: string | null;

    @Column({ type: 'timestamp', nullable: true })
    tokenExpiresAt: Date | null;

    @Column({
        type: 'enum',
        enum: TenantWhatsappAccountStatus,
        default: TenantWhatsappAccountStatus.NUMBER_SAVED,
    })
    status: TenantWhatsappAccountStatus;

    @Column({ type: 'timestamp', nullable: true })
    setupStartedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    connectedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    failedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    disabledAt: Date | null;

    @Column({ type: 'text', nullable: true })
    failureReason: string | null;

    @Column()
    createdById: string | null;

    @ManyToOne(() => PlatformUser, (user) => user.whatsappAccounts)
    @JoinColumn({ name: 'createdById' })
    createdBy: PlatformUser | null;

    @Column({ type: 'uuid', nullable: true })
    setupStartedById: string | null;

    @ManyToOne(() => PlatformUser, (user) => user.whatsappAccounts)
    @JoinColumn({ name: 'setupStartedById' })
    setupStartedBy: PlatformUser | null;

    @Column({ type: 'uuid', nullable: true })
    connectedById: string | null;

    @ManyToOne(() => PlatformUser, (user) => user.whatsappAccounts)
    @JoinColumn({ name: 'connectedById' })
    connectedBy: PlatformUser | null;

    @Column({ type: 'uuid', nullable: true })
    disabledById: string | null;

    @ManyToOne(() => PlatformUser, (user) => user.whatsappAccounts)
    @JoinColumn({ name: 'disabledById' })
    disabledBy: PlatformUser | null;

    @Column({ default: false })
    isDefault: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TenantWhatsappAccountTemplates, (template) => template.whatsappAccount)
    templates: TenantWhatsappAccountTemplates[];
}
