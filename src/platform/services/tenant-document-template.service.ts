import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import {
  DocumentTemplate,
  DocumentTemplateStatus,
} from 'src/master-db/entities/document-template.entity';
import {
  DocumentTemplateDocumentType,
  DocumentTemplateItem,
} from 'src/master-db/entities/document-template-item.entity';
import { TenantDocumentTemplate } from 'src/master-db/entities/tenant-document-template.entity';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { Repository } from 'typeorm';
import { AssignTenantDocumentTemplateDto } from '../dto/document-template/assign-tenant-document-template.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class TenantDocumentTemplateService {
  constructor(
    @InjectRepository(TenantDocumentTemplate)
    private readonly assignmentRepository: Repository<TenantDocumentTemplate>,
    @InjectRepository(DocumentTemplate)
    private readonly templateRepository: Repository<DocumentTemplate>,
    @InjectRepository(DocumentTemplateItem)
    private readonly itemRepository: Repository<DocumentTemplateItem>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private async recordAction(
    action: string,
    description: string,
    actorId: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.activityLogService.recordActivityLog({
      actorType: ActivityLogActorType.PLATFORM_USER,
      actorId,
      action,
      description,
      metadata: metadata ?? null,
    });
  }

  private async assertTenantExists(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  private async assertAssignableTemplate(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Document template not found');
    }
    if (template.status !== DocumentTemplateStatus.ACTIVE) {
      throw new BadRequestException(
        'Only ACTIVE document templates can be assigned to a tenant',
      );
    }
    return template;
  }

  async list(
    page = 1,
    limit = 10,
    user: { id: string },
    templateId?: string,
  ) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const [rows, total] = await this.assignmentRepository.findAndCount({
      where: templateId ? { templateId } : {},
      skip,
      take,
      order: { updatedAt: 'DESC' },
      relations: ['template', 'tenant'],
    });

    await this.recordAction(
      'TENANT_DOCUMENT_TEMPLATE_LIST',
      'Tenant document template assignments listed',
      user.id,
      { page, limit: take, total, templateId },
    );

    return {
      data: rows,
      meta: { total, page: Number(page), limit: take },
    };
  }

  async getByTenant(tenantId: string, user?: { id: string }) {
    await this.assertTenantExists(tenantId);

    const assignment = await this.assignmentRepository.findOne({
      where: { tenantId },
      relations: ['template', 'template.items'],
    });

    if (!assignment) {
      throw new NotFoundException(
        'No document template assigned to this tenant',
      );
    }

    if (user?.id) {
      await this.recordAction(
        'TENANT_DOCUMENT_TEMPLATE_SHOW',
        'Tenant document template assignment fetched',
        user.id,
        { tenantId, templateId: assignment.templateId },
      );
    }

    return assignment;
  }

  /**
   * Resolve the pack for a tenant: explicit assignment → global default.
   */
  async resolveTemplateForTenant(tenantId: string): Promise<DocumentTemplate> {
    await this.assertTenantExists(tenantId);

    const assignment = await this.assignmentRepository.findOne({
      where: { tenantId },
      relations: ['template', 'template.items'],
    });

    if (
      assignment?.template &&
      assignment.template.status === DocumentTemplateStatus.ACTIVE
    ) {
      return assignment.template;
    }

    const fallback = await this.templateRepository.findOne({
      where: {
        isDefault: true,
        status: DocumentTemplateStatus.ACTIVE,
      },
      relations: ['items'],
    });

    if (!fallback) {
      throw new NotFoundException(
        'No document template available for this tenant (no assignment and no default)',
      );
    }

    return fallback;
  }

  /**
   * Resolve a single document-type item for PDF rendering.
   */
  async resolveItemForTenant(
    tenantId: string,
    documentType: DocumentTemplateDocumentType,
  ): Promise<{
    template: DocumentTemplate;
    item: DocumentTemplateItem;
  }> {
    const template = await this.resolveTemplateForTenant(tenantId);

    const item =
      template.items?.find(
        (row) =>
          row.documentType === documentType && row.isActive !== false,
      ) ??
      (await this.itemRepository.findOne({
        where: {
          templateId: template.id,
          documentType,
          isActive: true,
        },
      }));

    if (!item) {
      throw new NotFoundException(
        `Template pack "${template.code}" has no active item for ${documentType}`,
      );
    }

    return { template, item };
  }

  async assign(data: AssignTenantDocumentTemplateDto, user: { id: string }) {
    await this.assertTenantExists(data.tenantId);
    await this.assertAssignableTemplate(data.templateId);

    let assignment = await this.assignmentRepository.findOne({
      where: { tenantId: data.tenantId },
    });

    if (assignment) {
      assignment.templateId = data.templateId;
    } else {
      assignment = this.assignmentRepository.create({
        tenantId: data.tenantId,
        templateId: data.templateId,
      });
    }

    const saved = await this.assignmentRepository.save(assignment);

    await this.recordAction(
      'TENANT_DOCUMENT_TEMPLATE_ASSIGN',
      'Document template assigned to tenant',
      user.id,
      { tenantId: data.tenantId, templateId: data.templateId },
    );

    return this.assignmentRepository.findOne({
      where: { id: saved.id },
      relations: ['template', 'template.items', 'tenant'],
    });
  }

  async unassign(tenantId: string, user: { id: string }) {
    await this.assertTenantExists(tenantId);

    const assignment = await this.assignmentRepository.findOne({
      where: { tenantId },
    });

    if (!assignment) {
      throw new NotFoundException(
        'No document template assigned to this tenant',
      );
    }

    await this.assignmentRepository.remove(assignment);

    await this.recordAction(
      'TENANT_DOCUMENT_TEMPLATE_UNASSIGN',
      'Document template unassigned from tenant',
      user.id,
      { tenantId, templateId: assignment.templateId },
    );

    return { success: true };
  }

  async countByTemplate(templateId: string): Promise<number> {
    return this.assignmentRepository.count({ where: { templateId } });
  }
}
