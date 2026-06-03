import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { TenantWhatsappAccounts } from './tenant-whatsapp-accounts.entity';
import { WhatsappTemplate } from './whatsapp-template.entity';

export enum TenantWhatsappTemplateStatus {
    NOT_SUBMITTED = 'NOT_SUBMITTED',
    SUBMITTED = 'SUBMITTED',
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    PAUSED = 'PAUSED',
    DISABLED = 'DISABLED',
    FAILED = 'FAILED',
}

@Entity({ name: 'tenant_whatsapp_account_templates' })
export class TenantWhatsappAccountTemplates {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    tenantId: string;

    @Column({ type: 'uuid' })
    whatsappAccountId: string;

    @ManyToOne(() => TenantWhatsappAccounts, (account) => account.templates, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'whatsappAccountId' })
    whatsappAccount: TenantWhatsappAccounts;

    @Column({ type: 'uuid' })
    templateId: string;

    @ManyToOne(() => WhatsappTemplate, (template) => template.templates, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'templateId' })
    template: WhatsappTemplate;

    @Column({ nullable: true })
    metaTemplateId: string | null;

    @Column()
    metaTemplateName: string;

    @Column()
    languageCode: string;

    @Column({
        type: 'enum',
        enum: TenantWhatsappTemplateStatus,
        default: TenantWhatsappTemplateStatus.NOT_SUBMITTED,
    })
    status: TenantWhatsappTemplateStatus;

    @Column({ type: 'jsonb', nullable: true })
    submittedPayload: any | null;

    @Column({ type: 'jsonb', nullable: true })
    metaResponse: any | null;

    @Column({ type: 'text', nullable: true })
    rejectionReason: string | null;

    @Column({ type: 'timestamp', nullable: true })
    submittedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    approvedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    rejectedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    lastSyncedAt: Date | null;

    @Column({ default: true })
    isEnabled: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}