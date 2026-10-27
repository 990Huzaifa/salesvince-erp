import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantDocumentTemplate } from './tenant-document-template.entity';
import { DocumentTemplateItem } from './document-template-item.entity';


export enum DocumentTemplateStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('document_templates')
export class DocumentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ nullable: true })
  previewImageUrl: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column({
    type: 'enum',
    enum: DocumentTemplateStatus,
    default: DocumentTemplateStatus.ACTIVE,
  })
  status: DocumentTemplateStatus;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => DocumentTemplateItem, (item) => item.template)
  items: DocumentTemplateItem[];

  @OneToMany(
    () => TenantDocumentTemplate,
    (assignment) => assignment.template,
  )
  tenantAssignments: TenantDocumentTemplate[];
}
