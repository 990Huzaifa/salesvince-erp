import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { S3Service } from 'src/common/s3/s3.service';
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

export type DocumentTemplateUploadKind = 'preview' | 'file';

const PREVIEW_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const FILE_MIME_TYPES = new Set([
  'text/html',
  'text/plain',
  'text/css',
  'application/json',
  'application/octet-stream',
  'text/x-handlebars-template',
  'application/x-handlebars-template',
]);

const FILE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.hbs',
  '.handlebars',
  '.txt',
  '.css',
  '.json',
]);

@Injectable()
export class DocumentTemplateService {
  constructor(
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplateRepository: Repository<DocumentTemplate>,
    @InjectRepository(TenantDocumentTemplate)
    private readonly tenantDocumentTemplateRepository: Repository<TenantDocumentTemplate>,
    private readonly activityLogService: ActivityLogService,
    private readonly s3Service: S3Service,
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

  private resolveSafeExtension(originalName: string, mimeType: string) {
    const rawExt = extname(originalName || '').toLowerCase();
    if (rawExt && /^[.][a-z0-9]{1,10}$/i.test(rawExt)) {
      return rawExt.replace('.', '');
    }

    if (mimeType.startsWith('image/')) {
      return mimeType.split('/')[1] || 'bin';
    }

    if (mimeType.includes('handlebars')) return 'hbs';
    if (mimeType === 'text/html') return 'html';
    if (mimeType === 'text/plain') return 'txt';
    if (mimeType === 'application/json') return 'json';
    return 'bin';
  }

  private assertUploadAllowed(
    kind: DocumentTemplateUploadKind,
    file: Express.Multer.File,
  ) {
    const mimeType = (file.mimetype || '').toLowerCase();
    const extension = extname(file.originalname || '').toLowerCase();

    if (kind === 'preview') {
      if (!PREVIEW_MIME_TYPES.has(mimeType)) {
        throw new BadRequestException(
          'Preview upload accepts JPEG, PNG, WEBP, or GIF only',
        );
      }
      return;
    }

    const mimeOk = FILE_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/');
    const extensionOk = !extension || FILE_EXTENSIONS.has(extension);
    if (!mimeOk && !extensionOk) {
      throw new BadRequestException(
        'Template file upload accepts HTML, Handlebars, TXT, CSS, or JSON files',
      );
    }
  }

  async uploadAsset(
    kind: DocumentTemplateUploadKind,
    file: Express.Multer.File,
    user: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (kind !== 'preview' && kind !== 'file') {
      throw new BadRequestException('kind must be preview or file');
    }

    this.assertUploadAllowed(kind, file);

    const extension = this.resolveSafeExtension(file.originalname, file.mimetype);
    const key = `platform/document-templates/${kind}/${randomUUID()}.${extension}`;
    const uploaded = await this.s3Service.uploadObject(
      key,
      file.buffer,
      file.mimetype || undefined,
    );

    await this.recordAction(
      'DOCUMENT_TEMPLATE_UPLOAD',
      'Document template asset uploaded',
      user.id,
      {
        kind,
        key: uploaded.key,
        url: uploaded.url,
        mimeType: file.mimetype,
        originalFileName: file.originalname,
        size: file.size,
      },
    );

    return {
      kind,
      key: uploaded.key,
      url: uploaded.url,
      mimeType: file.mimetype || null,
      originalFileName: file.originalname || null,
      size: file.size,
    };
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

  /**
   * Public (no auth): ACTIVE pack + active sub-templates for tenant design integration.
   */
  async getPublicById(id: string) {
    const template = await this.documentTemplateRepository.findOne({
      where: {
        id,
        status: DocumentTemplateStatus.ACTIVE,
      },
      relations: ['items'],
    });

    if (!template) {
      throw new NotFoundException('Document template not found');
    }

    const items = (template.items ?? [])
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.documentType.localeCompare(b.documentType))
      .map((item) => ({
        id: item.id,
        documentType: item.documentType,
        name: item.name,
        sourceType: item.sourceType,
        engine: item.engine,
        content: item.content,
        fileUrl: item.fileUrl,
        fileMimeType: item.fileMimeType,
        pageSettings: item.pageSettings,
        variables: item.variables,
        isActive: item.isActive,
      }));

    return {
      id: template.id,
      code: template.code,
      name: template.name,
      description: template.description,
      previewImageUrl: template.previewImageUrl,
      isDefault: template.isDefault,
      status: template.status,
      sortOrder: template.sortOrder,
      metadata: template.metadata,
      items,
    };
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
