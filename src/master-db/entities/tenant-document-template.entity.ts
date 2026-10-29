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
import { Tenant } from './tenant.entity';

@Entity('tenant_document_templates')
@Unique('UQ_tenant_document_templates_tenant_template', ['tenantId', 'templateId'])
export class TenantDocumentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_tenant_document_templates_tenantId')
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Index('IDX_tenant_document_templates_templateId')
  @Column({ type: 'uuid' })
  templateId: string;

  @ManyToOne(
    () => DocumentTemplate,
    (template) => template.tenantAssignments,
    { onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'templateId' })
  template: DocumentTemplate;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
