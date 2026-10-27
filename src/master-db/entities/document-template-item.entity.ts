import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentTemplate } from './document-template.entity';

export enum DocumentTemplateDocumentType {
  SALE_INVOICE = 'SALE_INVOICE',
  PURCHASE_INVOICE = 'PURCHASE_INVOICE',
  SALE_ORDER = 'SALE_ORDER',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  WAREHOUSE_SLIP = 'WAREHOUSE_SLIP',
  GRN = 'GRN',
  PAYSLIP = 'PAYSLIP',
  PARTY_LEDGER = 'PARTY_LEDGER',
  GENERAL_LEDGER = 'GENERAL_LEDGER',
  ACCOUNTS_LIST = 'ACCOUNTS_LIST',
  VOUCHER = 'VOUCHER',
  REPORT = 'REPORT',
}

export enum DocumentTemplateSourceType {
  INLINE = 'INLINE',
  FILE = 'FILE',
}

export enum DocumentTemplateEngine {
  HTML = 'HTML',
  HANDLEBARS = 'HANDLEBARS',
}

@Entity('document_template_items')
@Unique('UQ_document_template_items_template_doctype', [
  'templateId',
  'documentType',
])
export class DocumentTemplateItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_document_template_items_templateId')
  @Column({ type: 'uuid' })
  templateId: string;

  @ManyToOne(() => DocumentTemplate, (template) => template.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'templateId' })
  template: DocumentTemplate;

  @Column({
    type: 'enum',
    enum: DocumentTemplateDocumentType,
  })
  documentType: DocumentTemplateDocumentType;

  @Column({ nullable: true })
  name: string | null;

  @Column({
    type: 'enum',
    enum: DocumentTemplateSourceType,
    default: DocumentTemplateSourceType.INLINE,
  })
  sourceType: DocumentTemplateSourceType;

  @Column({
    type: 'enum',
    enum: DocumentTemplateEngine,
    default: DocumentTemplateEngine.HTML,
  })
  engine: DocumentTemplateEngine;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ nullable: true })
  fileUrl: string | null;

  @Column({ nullable: true })
  fileMimeType: string | null;

  @Column({ type: 'jsonb', nullable: true })
  pageSettings: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  variables: unknown[] | Record<string, unknown> | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
