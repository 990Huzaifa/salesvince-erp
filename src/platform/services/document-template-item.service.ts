import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { DocumentTemplate } from 'src/master-db/entities/document-template.entity';
import {
  DocumentTemplateDocumentType,
  DocumentTemplateEngine,
  DocumentTemplateItem,
  DocumentTemplateSourceType,
} from 'src/master-db/entities/document-template-item.entity';
import { Not, Repository } from 'typeorm';
import { CreateDocumentTemplateItemDto } from '../dto/document-template/create-document-template-item.dto';
import { UpdateDocumentTemplateItemDto } from '../dto/document-template/update-document-template-item.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class DocumentTemplateItemService {
  constructor(
    @InjectRepository(DocumentTemplateItem)
    private readonly itemRepository: Repository<DocumentTemplateItem>,
    @InjectRepository(DocumentTemplate)
    private readonly templateRepository: Repository<DocumentTemplate>,
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

  private async assertTemplateExists(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Document template not found');
    }
    return template;
  }

  private normalizeSourcePayload(input: {
    sourceType?: DocumentTemplateSourceType;
    content?: string | null;
    fileUrl?: string | null;
    fileMimeType?: string | null;
  }): {
    sourceType: DocumentTemplateSourceType;
    content: string | null;
    fileUrl: string | null;
    fileMimeType: string | null;
  } {
    const sourceType = input.sourceType ?? DocumentTemplateSourceType.INLINE;

    if (sourceType === DocumentTemplateSourceType.INLINE) {
      const content = input.content?.trim();
      if (!content) {
        throw new BadRequestException(
          'content is required when sourceType is INLINE',
        );
      }
      return {
        sourceType,
        content,
        fileUrl: null,
        fileMimeType: null,
      };
    }

    const fileUrl = input.fileUrl?.trim();
    if (!fileUrl) {
      throw new BadRequestException(
        'fileUrl is required when sourceType is FILE',
      );
    }

    return {
      sourceType,
      content: null,
      fileUrl,
      fileMimeType: input.fileMimeType?.trim() || null,
    };
  }

  private async findItemOrFail(id: string): Promise<DocumentTemplateItem> {
    const item = await this.itemRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Document template item not found');
    }
    return item;
  }

  async listByTemplate(
    templateId: string,
    user: { id: string },
    documentType?: DocumentTemplateDocumentType,
  ) {
    await this.assertTemplateExists(templateId);

    const items = await this.itemRepository.find({
      where: {
        templateId,
        ...(documentType ? { documentType } : {}),
      },
      order: { documentType: 'ASC', createdAt: 'ASC' },
    });

    await this.recordAction(
      'DOCUMENT_TEMPLATE_ITEM_LIST',
      'Document template items listed',
      user.id,
      { templateId, documentType, total: items.length },
    );

    return { data: items };
  }

  async getById(id: string, user: { id: string }) {
    const item = await this.findItemOrFail(id);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_ITEM_SHOW',
      'Document template item fetched',
      user.id,
      { itemId: id, templateId: item.templateId },
    );

    return item;
  }

  async getByTemplateAndType(
    templateId: string,
    documentType: DocumentTemplateDocumentType,
    user?: { id: string },
  ) {
    await this.assertTemplateExists(templateId);

    const item = await this.itemRepository.findOne({
      where: { templateId, documentType },
    });

    if (!item) {
      throw new NotFoundException(
        `No template item for document type ${documentType}`,
      );
    }

    if (user?.id) {
      await this.recordAction(
        'DOCUMENT_TEMPLATE_ITEM_SHOW_BY_TYPE',
        'Document template item fetched by type',
        user.id,
        { templateId, documentType, itemId: item.id },
      );
    }

    return item;
  }

  async create(
    templateId: string,
    data: CreateDocumentTemplateItemDto,
    user: { id: string },
  ) {
    await this.assertTemplateExists(templateId);

    const existing = await this.itemRepository.findOne({
      where: { templateId, documentType: data.documentType },
    });
    if (existing) {
      throw new ConflictException(
        `Template already has an item for ${data.documentType}`,
      );
    }

    const source = this.normalizeSourcePayload({
      sourceType: data.sourceType,
      content: data.content,
      fileUrl: data.fileUrl,
      fileMimeType: data.fileMimeType,
    });

    const item = this.itemRepository.create({
      templateId,
      documentType: data.documentType,
      name: data.name?.trim() || null,
      ...source,
      engine: data.engine ?? DocumentTemplateEngine.HTML,
      pageSettings: data.pageSettings ?? null,
      variables: data.variables ?? null,
      isActive: data.isActive ?? true,
    });

    const saved = await this.itemRepository.save(item);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_ITEM_CREATE',
      'Document template item created',
      user.id,
      {
        itemId: saved.id,
        templateId,
        documentType: saved.documentType,
      },
    );

    return saved;
  }

  async upsertByType(
    templateId: string,
    data: CreateDocumentTemplateItemDto,
    user: { id: string },
  ) {
    await this.assertTemplateExists(templateId);

    const existing = await this.itemRepository.findOne({
      where: { templateId, documentType: data.documentType },
    });

    if (!existing) {
      return this.create(templateId, data, user);
    }

    return this.update(existing.id, data, user);
  }

  async update(
    id: string,
    data: UpdateDocumentTemplateItemDto,
    user: { id: string },
  ) {
    const item = await this.findItemOrFail(id);

    if (data.documentType && data.documentType !== item.documentType) {
      const conflict = await this.itemRepository.findOne({
        where: {
          templateId: item.templateId,
          documentType: data.documentType,
          id: Not(id),
        },
      });
      if (conflict) {
        throw new ConflictException(
          `Template already has an item for ${data.documentType}`,
        );
      }
      item.documentType = data.documentType;
    }

    if (data.name !== undefined) item.name = data.name?.trim() || null;
    if (data.engine !== undefined) item.engine = data.engine;
    if (data.pageSettings !== undefined) {
      item.pageSettings = data.pageSettings ?? null;
    }
    if (data.variables !== undefined) item.variables = data.variables ?? null;
    if (data.isActive !== undefined) item.isActive = data.isActive;

    const nextSourceType = data.sourceType ?? item.sourceType;
    const touchingSource =
      data.sourceType !== undefined ||
      data.content !== undefined ||
      data.fileUrl !== undefined ||
      data.fileMimeType !== undefined;

    if (touchingSource) {
      const source = this.normalizeSourcePayload({
        sourceType: nextSourceType,
        content:
          data.content !== undefined ? data.content : item.content,
        fileUrl: data.fileUrl !== undefined ? data.fileUrl : item.fileUrl,
        fileMimeType:
          data.fileMimeType !== undefined
            ? data.fileMimeType
            : item.fileMimeType,
      });
      Object.assign(item, source);
    }

    const saved = await this.itemRepository.save(item);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_ITEM_UPDATE',
      'Document template item updated',
      user.id,
      { itemId: id, templateId: item.templateId },
    );

    return saved;
  }

  async setActive(id: string, isActive: boolean, user: { id: string }) {
    const item = await this.findItemOrFail(id);
    item.isActive = isActive;
    const saved = await this.itemRepository.save(item);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_ITEM_ACTIVE_UPDATE',
      'Document template item active flag updated',
      user.id,
      { itemId: id, isActive },
    );

    return saved;
  }

  async delete(id: string, user: { id: string }) {
    const item = await this.findItemOrFail(id);
    await this.itemRepository.remove(item);

    await this.recordAction(
      'DOCUMENT_TEMPLATE_ITEM_DELETE',
      'Document template item deleted',
      user.id,
      {
        itemId: id,
        templateId: item.templateId,
        documentType: item.documentType,
      },
    );

    return { success: true };
  }
}
