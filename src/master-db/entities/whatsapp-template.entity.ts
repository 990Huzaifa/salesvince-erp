import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { TenantWhatsappAccountTemplates } from './tenant_whatsapp_account_templates.entity';

export enum WhatsappTemplateCategory {
    UTILITY = 'UTILITY',
    MARKETING = 'MARKETING',
    AUTHENTICATION = 'AUTHENTICATION',
}

export enum WhatsappTemplateStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export enum WhatsappTemplateMetaSyncStatus {
    NOT_SUBMITTED = 'NOT_SUBMITTED',
    SUBMITTED = 'SUBMITTED',
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    PAUSED = 'PAUSED',
    DISABLED = 'DISABLED',
    FAILED = 'FAILED',
}

export enum WhatsappTemplateModuleType {
    PURCHASE_ORDER = 'PURCHASE_ORDER',
    SALE_ORDER = 'SALE_ORDER',
    PURCAHSE_RETURN = 'PURCHASE_RETURN',
    SALE_RETURN = 'SALE_RETURN',
    SALE_INVOICE = 'SALE_INVOICE',
    PURCHASE_INVOICE = 'PURCHASE_INVOICE',
    VOUCHER = 'VOUCHER',
    SALARY_SLIP = 'SALARY_SLIP',
    PAYMENT_RECEIPT = 'PAYMENT_RECEIPT',
}

export enum WhatsappTemplateHeaderType {
    NONE = 'NONE',
    TEXT = 'TEXT',
    IMAGE = 'IMAGE',
    DOCUMENT = 'DOCUMENT',
    VIDEO = 'VIDEO',
}

@Entity('whatsapp_templates')
export class WhatsappTemplate {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string;
    // invoice_created, purchase_order_created, salary_slip_generated

    @Column()
    metaTemplateName: string;
    // salesvince_invoice_created
    // lowercase + underscore format best rahega

    @Column({
        type: 'enum',
        enum: WhatsappTemplateModuleType,
    })
    moduleType: WhatsappTemplateModuleType;

    @Column({ nullable: true })
    eventType: string | null;
    // CREATED, APPROVED, GENERATED, PAID etc.

    @Column({
        type: 'enum',
        enum: WhatsappTemplateCategory,
        default: WhatsappTemplateCategory.UTILITY,
    })
    category: WhatsappTemplateCategory;

    @Column({ default: 'en' })
    languageCode: string;
    // en, en_US, ur etc.

    @Column({
        type: 'enum',
        enum: WhatsappTemplateHeaderType,
        default: WhatsappTemplateHeaderType.NONE,
    })
    headerType: WhatsappTemplateHeaderType;

    @Column({ type: 'text', nullable: true })
    headerText: string | null;

    @Column({ type: 'text' })
    bodyText: string;
    // Hello {{1}}, your invoice {{2}} has been generated.

    @Column({ type: 'text', nullable: true })
    footerText: string | null;

    @Column({ type: 'jsonb', nullable: true })
    buttons: any[] | null;

    @Column({ type: 'jsonb', nullable: true })
    variables: any[] | null;
    // [
    //   { "index": 1, "key": "customerName" },
    //   { "index": 2, "key": "invoiceNumber" }
    // ]

    @Column({ type: 'jsonb', nullable: true })
    sampleValues: any | null;
    // Meta approval ke liye sample data

    @Column({ default: true })
    attachPdf: boolean;

    @Column({
        type: 'enum',
        enum: WhatsappTemplateStatus,
        default: WhatsappTemplateStatus.ACTIVE,
    })
    status: WhatsappTemplateStatus;

    @Column({ nullable: true })
    metaTemplateId: string | null;

    @Column({
        type: 'enum',
        enum: WhatsappTemplateMetaSyncStatus,
        default: WhatsappTemplateMetaSyncStatus.NOT_SUBMITTED,
    })
    metaSyncStatus: WhatsappTemplateMetaSyncStatus;

    @Column({ type: 'jsonb', nullable: true })
    submittedPayload: Record<string, unknown> | null;

    @Column({ type: 'jsonb', nullable: true })
    metaResponse: Record<string, unknown> | null;

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => TenantWhatsappAccountTemplates, (template) => template.template)
    templates: TenantWhatsappAccountTemplates[];
}