import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import {
    WhatsappTemplate,
    WhatsappTemplateHeaderType,
    WhatsappTemplateMetaSyncStatus,
    WhatsappTemplateStatus,
} from 'src/master-db/entities/whatsapp-template.entity';
import { Not, Repository } from 'typeorm';
import { CreateWhatsappTemplateDto } from '../dto/whatsapp-template/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from '../dto/whatsapp-template/update-whatsapp-template.dto';
import { UpdateWhatsappTemplateStatusDto } from '../dto/whatsapp-template/update-whatsapp-template-status.dto';
import { ActivityLogService } from './activity-log.service';
import {
    MetaCreateMessageTemplatePayload,
    MetaWhatsappApiService,
} from './meta-whatsapp-api.service';

@Injectable()
export class WhatsappTemplateService {
    private readonly logger = new Logger(WhatsappTemplateService.name);

    constructor(
        @InjectRepository(WhatsappTemplate)
        private readonly whatsappTemplateRepository: Repository<WhatsappTemplate>,
        private readonly activityLogService: ActivityLogService,
        private readonly metaApi: MetaWhatsappApiService,
    ) {}

    private async recordAction(
        action: string,
        description: string,
        actorId: string,
        metadata?: Record<string, any>,
    ) {
        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId,
            action,
            description,
            metadata: metadata ?? null,
        });
    }

    async getTemplates(page = 1, limit = 10, user: any) {
        const skip = (page - 1) * limit;
        const [templates, total] = await this.whatsappTemplateRepository.findAndCount({
            skip,
            take: limit,
            order: { createdAt: 'DESC' },
        });

        await this.recordAction(
            'WHATSAPP_TEMPLATE_LIST',
            'WhatsApp template list fetched',
            user.id,
            { page, limit, total },
        );

        return {
            data: templates,
            meta: {
                total,
                page,
                limit,
            },
        };
    }

    async getTemplateById(id: string, user: any) {
        const template = await this.whatsappTemplateRepository.findOne({
            where: { id },
        });

        if (!template) {
            throw new NotFoundException('WhatsApp template not found');
        }

        await this.recordAction(
            'WHATSAPP_TEMPLATE_SHOW',
            'WhatsApp template details fetched',
            user.id,
            { templateId: id },
        );

        return template;
    }

    async createTemplate(data: CreateWhatsappTemplateDto, user: any) {
        const existing = await this.whatsappTemplateRepository.findOne({
            where: { code: data.code },
        });

        if (existing) {
            throw new ConflictException('WhatsApp template code already exists');
        }

        const template = this.whatsappTemplateRepository.create(data);
        const savedTemplate = await this.whatsappTemplateRepository.save(template);

        await this.recordAction(
            'WHATSAPP_TEMPLATE_CREATE',
            'WhatsApp template created',
            user.id,
            { templateId: savedTemplate.id, code: savedTemplate.code },
        );

        return savedTemplate;
    }

    async updateTemplate(id: string, data: UpdateWhatsappTemplateDto, user: any) {
        const template = await this.whatsappTemplateRepository.findOne({
            where: { id },
        });

        if (!template) {
            throw new NotFoundException('WhatsApp template not found');
        }

        if (data.code && data.code !== template.code) {
            const codeExists = await this.whatsappTemplateRepository.findOne({
                where: { code: data.code, id: Not(id) },
            });

            if (codeExists) {
                throw new ConflictException('WhatsApp template code already exists');
            }
        }

        Object.assign(template, data);
        const savedTemplate = await this.whatsappTemplateRepository.save(template);

        await this.recordAction(
            'WHATSAPP_TEMPLATE_UPDATE',
            'WhatsApp template updated',
            user.id,
            { templateId: id },
        );

        return savedTemplate;
    }

    async updateTemplateStatus(
        id: string,
        data: UpdateWhatsappTemplateStatusDto,
        user: any,
    ) {
        const template = await this.whatsappTemplateRepository.findOne({
            where: { id },
        });

        if (!template) {
            throw new NotFoundException('WhatsApp template not found');
        }

        template.status = data.status;
        const savedTemplate = await this.whatsappTemplateRepository.save(template);

        await this.recordAction(
            'WHATSAPP_TEMPLATE_STATUS_UPDATE',
            'WhatsApp template status updated',
            user.id,
            { templateId: id, status: data.status },
        );

        return savedTemplate;
    }

    /**
     * Creates (or links) the local generic template on the shared Meta WABA.
     */
    async syncTemplateToMeta(id: string, user: { id: string }) {
        const template = await this.whatsappTemplateRepository.findOne({
            where: { id },
        });

        if (!template) {
            throw new NotFoundException('WhatsApp template not found');
        }

        if (template.status !== WhatsappTemplateStatus.ACTIVE) {
            throw new BadRequestException('Only ACTIVE templates can be synced to Meta');
        }

        if (
            template.metaSyncStatus === WhatsappTemplateMetaSyncStatus.APPROVED ||
            template.metaSyncStatus === WhatsappTemplateMetaSyncStatus.PENDING ||
            template.metaSyncStatus === WhatsappTemplateMetaSyncStatus.SUBMITTED
        ) {
            throw new BadRequestException(
                `Template already synced with Meta status ${template.metaSyncStatus}`,
            );
        }

        try {
            this.metaApi.assertWabaConfigured();
        } catch {
            throw new BadRequestException(
                'META_WABA_ID and META_ACCESS_TOKEN must be configured',
            );
        }

        const payload = this.buildMetaTemplatePayload(template);

        try {
            const result = await this.metaApi.createMessageTemplate(payload);
            const syncStatus = this.mapMetaStatus(result.status);

            template.metaTemplateId = result.id;
            template.metaSyncStatus = syncStatus;
            template.submittedPayload = payload as unknown as Record<string, unknown>;
            template.metaResponse = result as unknown as Record<string, unknown>;
            template.rejectionReason = null;
            template.submittedAt = new Date();
            template.lastSyncedAt = new Date();
            if (syncStatus === WhatsappTemplateMetaSyncStatus.APPROVED) {
                template.approvedAt = new Date();
            }

            const saved = await this.whatsappTemplateRepository.save(template);

            await this.recordAction(
                'WHATSAPP_TEMPLATE_SYNC',
                'WhatsApp template synced to Meta',
                user.id,
                {
                    templateId: id,
                    metaTemplateId: result.id,
                    metaSyncStatus: syncStatus,
                },
            );

            return saved;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const alreadyExists = /already exists|duplicate/i.test(message);

            if (alreadyExists) {
                const existing = await this.metaApi.findMessageTemplateByName(
                    template.metaTemplateName,
                    template.languageCode,
                );

                if (existing) {
                    template.metaTemplateId = existing.id;
                    template.metaSyncStatus = this.mapMetaStatus(existing.status);
                    template.submittedPayload =
                        payload as unknown as Record<string, unknown>;
                    template.metaResponse = existing as unknown as Record<string, unknown>;
                    template.rejectionReason = null;
                    template.submittedAt = template.submittedAt ?? new Date();
                    template.lastSyncedAt = new Date();
                    if (
                        template.metaSyncStatus ===
                        WhatsappTemplateMetaSyncStatus.APPROVED
                    ) {
                        template.approvedAt = new Date();
                    }

                    const saved = await this.whatsappTemplateRepository.save(template);

                    await this.recordAction(
                        'WHATSAPP_TEMPLATE_SYNC_LINKED',
                        'WhatsApp template linked to existing Meta template',
                        user.id,
                        {
                            templateId: id,
                            metaTemplateId: existing.id,
                            metaSyncStatus: template.metaSyncStatus,
                        },
                    );

                    return saved;
                }
            }

            template.metaSyncStatus = WhatsappTemplateMetaSyncStatus.FAILED;
            template.rejectionReason = message;
            template.metaResponse = { error: message };
            template.lastSyncedAt = new Date();
            await this.whatsappTemplateRepository.save(template);

            await this.recordAction(
                'WHATSAPP_TEMPLATE_SYNC_FAILED',
                'WhatsApp template Meta sync failed',
                user.id,
                { templateId: id, error: message },
            );

            throw new BadRequestException(`Meta template sync failed: ${message}`);
        }
    }

    /**
     * Applies Meta webhook template status updates to the generic template row.
     */
    async handleMetaTemplateStatusUpdate(value: any): Promise<void> {
        const metaTemplateId = value?.message_template_id?.toString();
        const metaTemplateName = value?.message_template_name;
        const event = value?.event;

        if (!metaTemplateId && !metaTemplateName) {
            return;
        }

        const template = metaTemplateId
            ? await this.whatsappTemplateRepository.findOne({
                  where: { metaTemplateId },
              })
            : await this.whatsappTemplateRepository.findOne({
                  where: { metaTemplateName },
              });

        if (!template) {
            this.logger.debug(
                `No local template for Meta webhook name=${metaTemplateName} id=${metaTemplateId}`,
            );
            return;
        }

        const syncStatus = this.mapMetaStatus(event);
        if (event && syncStatus !== WhatsappTemplateMetaSyncStatus.NOT_SUBMITTED) {
            template.metaSyncStatus = syncStatus;
        }

        if (metaTemplateId) {
            template.metaTemplateId = metaTemplateId;
        }

        template.metaResponse = value;
        template.rejectionReason = value?.reason ?? template.rejectionReason;
        template.lastSyncedAt = new Date();

        if (template.metaSyncStatus === WhatsappTemplateMetaSyncStatus.APPROVED) {
            template.approvedAt = new Date();
        }
        if (template.metaSyncStatus === WhatsappTemplateMetaSyncStatus.REJECTED) {
            template.rejectedAt = new Date();
        }

        await this.whatsappTemplateRepository.save(template);
    }

    private mapMetaStatus(status?: string): WhatsappTemplateMetaSyncStatus {
        const normalized = (status ?? '').toUpperCase();
        const map: Record<string, WhatsappTemplateMetaSyncStatus> = {
            APPROVED: WhatsappTemplateMetaSyncStatus.APPROVED,
            REJECTED: WhatsappTemplateMetaSyncStatus.REJECTED,
            PENDING: WhatsappTemplateMetaSyncStatus.PENDING,
            SUBMITTED: WhatsappTemplateMetaSyncStatus.SUBMITTED,
            PAUSED: WhatsappTemplateMetaSyncStatus.PAUSED,
            DISABLED: WhatsappTemplateMetaSyncStatus.DISABLED,
            FAILED: WhatsappTemplateMetaSyncStatus.FAILED,
            IN_APPEAL: WhatsappTemplateMetaSyncStatus.PENDING,
        };
        return map[normalized] ?? WhatsappTemplateMetaSyncStatus.PENDING;
    }

    private buildMetaTemplatePayload(
        template: WhatsappTemplate,
    ): MetaCreateMessageTemplatePayload {
        return {
            name: template.metaTemplateName,
            language: template.languageCode,
            category: template.category,
            allow_category_change: true,
            components: this.buildMetaComponents(template),
        };
    }

    private buildMetaComponents(template: WhatsappTemplate): Record<string, unknown>[] {
        const components: Record<string, unknown>[] = [];

        if (template.headerType === WhatsappTemplateHeaderType.TEXT) {
            if (!template.headerText?.trim()) {
                throw new BadRequestException('TEXT header requires headerText');
            }
            const header: Record<string, unknown> = {
                type: 'HEADER',
                format: 'TEXT',
                text: template.headerText,
            };
            const headerSamples = this.resolveHeaderSamples(template);
            if (headerSamples.length) {
                header.example = { header_text: headerSamples };
            }
            components.push(header);
        } else if (
            template.headerType === WhatsappTemplateHeaderType.IMAGE ||
            template.headerType === WhatsappTemplateHeaderType.DOCUMENT ||
            template.headerType === WhatsappTemplateHeaderType.VIDEO
        ) {
            const handle = this.resolveHeaderHandle(template);
            if (!handle) {
                throw new BadRequestException(
                    `Media header (${template.headerType}) requires sampleValues.headerHandle from Meta media upload`,
                );
            }
            components.push({
                type: 'HEADER',
                format: template.headerType,
                example: { header_handle: [handle] },
            });
        }

        const body: Record<string, unknown> = {
            type: 'BODY',
            text: template.bodyText,
        };
        const bodySamples = this.resolveBodySamples(template);
        if (bodySamples.length) {
            body.example = { body_text: [bodySamples] };
        }
        components.push(body);

        if (template.footerText?.trim()) {
            components.push({
                type: 'FOOTER',
                text: template.footerText,
            });
        }

        if (template.buttons?.length) {
            components.push({
                type: 'BUTTONS',
                buttons: template.buttons,
            });
        }

        return components;
    }

    private countPlaceholders(text: string): number {
        const matches = text.match(/\{\{(\d+)\}\}/g);
        return matches?.length ?? 0;
    }

    private resolveBodySamples(template: WhatsappTemplate): string[] {
        const count = this.countPlaceholders(template.bodyText);
        if (count === 0) {
            return [];
        }

        const samples = this.extractSampleList(template.sampleValues, 'body');
        if (samples.length >= count) {
            return samples.slice(0, count);
        }

        if (Array.isArray(template.variables) && template.variables.length >= count) {
            return template.variables.slice(0, count).map((variable, index) => {
                if (typeof variable === 'string') {
                    return variable;
                }
                return (
                    variable?.sample ??
                    variable?.example ??
                    variable?.key ??
                    `sample_${index + 1}`
                );
            });
        }

        return Array.from({ length: count }, (_, index) => `sample_${index + 1}`);
    }

    private resolveHeaderSamples(template: WhatsappTemplate): string[] {
        if (!template.headerText) {
            return [];
        }
        const count = this.countPlaceholders(template.headerText);
        if (count === 0) {
            return [];
        }
        const samples = this.extractSampleList(template.sampleValues, 'header');
        if (samples.length >= count) {
            return samples.slice(0, count);
        }
        return Array.from({ length: count }, (_, index) => `header_${index + 1}`);
    }

    private resolveHeaderHandle(template: WhatsappTemplate): string | null {
        const values = template.sampleValues;
        if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return null;
        }
        const handle = (values as Record<string, unknown>).headerHandle;
        return typeof handle === 'string' && handle.trim() ? handle.trim() : null;
    }

    private extractSampleList(
        sampleValues: any,
        key: 'body' | 'header',
    ): string[] {
        if (!sampleValues) {
            return [];
        }
        if (Array.isArray(sampleValues)) {
            return sampleValues.map(String);
        }
        if (typeof sampleValues === 'object') {
            const keyed = sampleValues[key];
            if (Array.isArray(keyed)) {
                return keyed.map(String);
            }
            if (typeof keyed === 'string') {
                return [keyed];
            }
        }
        return [];
    }
}
