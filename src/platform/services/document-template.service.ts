import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import {
  DocumentTemplate,
  DocumentTemplateStatus,
} from 'src/master-db/entities/document-template.entity';
import { TenantDocumentTemplate } from 'src/master-db/entities/tenant-document-template.entity';
import { Not, Repository } from 'typeorm';
import { CreateDocumentTemplateDto } from '../dto/document-template/create-document-template.dto';
import { UpdateDocumentTemplateDto } from '../dto/document-template/update-document-template.dto';
import { UpdateDocumentTemplateStatusDto } from '../dto/document-template/update-document-template-status.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class DocumentTemplateService {
  constructor(
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplateRepository: Repository<DocumentTemplate>,
    @InjectRepository(TenantDocumentTemplate)
    private readonly tenantDocumentTemplateRepository: Repository<TenantDocumentTemplate>,
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

  private async findPackOrFail(id: string): Promise<DocumentTemplate> {
    const template = await this.documentTemplateRepository.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!template) {
      throw new NotFoundException('Document template not found');
    }
    return template;
  }

  private async assertUniqueCode(code: string, excludeId?: string) {
    const existing = await this.documentTemplateRepository.findOne({
      where: excludeId
        ? { code, id: Not(excludeId) }
        : { code },
    });
    if (existing) {
      throw new ConflictException('Document template code already exists');
    }
  }

  private async clearOtherDefaults(exceptId?: string) {
    const qb = this.documentTemplateRepository
      .createQueryBuilder()
      .update(DocumentTemplate)
      .set({ isDefault: false })
      .where('isDefault = :isDefault', { isDefault: true });

    if (exceptId) {
      qb.andWhere('id != :exceptId', { exceptId });
    }

    await qb.execute();
  }

  async list(page = 1, limit = 10, user: { id: string }, status?: DocumentTemplateStatus) {
    const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
    const take = Math.max(1, Number(limit));

    const [templates, total] = await this.documentTemplateRepository.findAndCount({
      where: status ? { status } : {},
      skip,
      take,
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      relations: ['items'],
    });

    await this.recordAction(
      'DOCUMENT_TEMPLATE_LIST',
      'Document template list fetched',
      user.id,
      { page, limit, total, status },
    );

    return {
      data: templates,
      meta: { total, page: Number(page), limit: take },
    };
  }

  async getById(id: string, user: { id: string }) {
    const template = await this.findPackOrFail(id);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_SHOW',
      'Document template details fetched',
      user.id,
      { templateId: id },
    );

    return template;
  }

  async getDefault(user?: { id: string }) {
    const template = await this.documentTemplateRepository.findOne({
      where: {
        isDefault: true,
        status: DocumentTemplateStatus.ACTIVE,
      },
      relations: ['items'],
    });

    if (!template) {
      throw new NotFoundException('Default document template not found');
    }

    if (user?.id) {
      await this.recordAction(
        'DOCUMENT_TEMPLATE_DEFAULT_SHOW',
        'Default document template fetched',
        user.id,
        { templateId: template.id },
      );
    }

    return template;
  }

  async create(data: CreateDocumentTemplateDto, user: { id: string }) {
    await this.assertUniqueCode(data.code);

    if (data.isDefault) {
      await this.clearOtherDefaults();
    }

    const template = this.documentTemplateRepository.create({
      code: data.code.trim(),
      name: data.name.trim(),
      description: data.description?.trim() || null,
      previewImageUrl: data.previewImageUrl?.trim() || null,
      isDefault: data.isDefault ?? false,
      status: data.status ?? DocumentTemplateStatus.ACTIVE,
      sortOrder: data.sortOrder ?? 0,
      metadata: data.metadata ?? null,
    });

    const saved = await this.documentTemplateRepository.save(template);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_CREATE',
      'Document template created',
      user.id,
      { templateId: saved.id, code: saved.code },
    );

    return this.findPackOrFail(saved.id);
  }

  async update(id: string, data: UpdateDocumentTemplateDto, user: { id: string }) {
    const template = await this.findPackOrFail(id);

    if (data.code && data.code.trim() !== template.code) {
      await this.assertUniqueCode(data.code.trim(), id);
      template.code = data.code.trim();
    }

    if (data.name !== undefined) template.name = data.name.trim();
    if (data.description !== undefined) {
      template.description = data.description?.trim() || null;
    }
    if (data.previewImageUrl !== undefined) {
      template.previewImageUrl = data.previewImageUrl?.trim() || null;
    }
    if (data.status !== undefined) template.status = data.status;
    if (data.sortOrder !== undefined) template.sortOrder = data.sortOrder;
    if (data.metadata !== undefined) template.metadata = data.metadata ?? null;

    if (data.isDefault === true) {
      await this.clearOtherDefaults(id);
      template.isDefault = true;
    } else if (data.isDefault === false) {
      template.isDefault = false;
    }

    await this.documentTemplateRepository.save(template);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_UPDATE',
      'Document template updated',
      user.id,
      { templateId: id },
    );

    return this.findPackOrFail(id);
  }

  async updateStatus(
    id: string,
    data: UpdateDocumentTemplateStatusDto,
    user: { id: string },
  ) {
    const template = await this.findPackOrFail(id);

    if (
      template.isDefault &&
      data.status === DocumentTemplateStatus.INACTIVE
    ) {
      throw new BadRequestException(
        'Cannot deactivate the default document template. Assign another default first.',
      );
    }

    template.status = data.status;
    await this.documentTemplateRepository.save(template);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_STATUS_UPDATE',
      'Document template status updated',
      user.id,
      { templateId: id, status: data.status },
    );

    return this.findPackOrFail(id);
  }

  async setDefault(id: string, user: { id: string }) {
    const template = await this.findPackOrFail(id);

    if (template.status !== DocumentTemplateStatus.ACTIVE) {
      throw new BadRequestException(
        'Only ACTIVE templates can be set as default',
      );
    }

    await this.clearOtherDefaults(id);
    template.isDefault = true;
    await this.documentTemplateRepository.save(template);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_SET_DEFAULT',
      'Document template set as default',
      user.id,
      { templateId: id },
    );

    return this.findPackOrFail(id);
  }

  async delete(id: string, user: { id: string }) {
    const template = await this.findPackOrFail(id);

    if (template.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default document template. Assign another default first.',
      );
    }

    const assignmentCount = await this.tenantDocumentTemplateRepository.count({
      where: { templateId: id },
    });

    if (assignmentCount > 0) {
      throw new BadRequestException(
        'Cannot delete template while tenants are assigned to it',
      );
    }

    await this.documentTemplateRepository.remove(template);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_DELETE',
      'Document template deleted',
      user.id,
      { templateId: id, code: template.code },
    );

    return { success: true };
  }
}
