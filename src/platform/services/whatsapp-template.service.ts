import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { WhatsappTemplate } from 'src/master-db/entities/whatsapp-template.entity';
import { Not, Repository } from 'typeorm';
import { CreateWhatsappTemplateDto } from '../dto/whatsapp-template/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from '../dto/whatsapp-template/update-whatsapp-template.dto';
import { UpdateWhatsappTemplateStatusDto } from '../dto/whatsapp-template/update-whatsapp-template-status.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class WhatsappTemplateService {
    constructor(
        @InjectRepository(WhatsappTemplate)
        private readonly whatsappTemplateRepository: Repository<WhatsappTemplate>,
        private readonly activityLogService: ActivityLogService,
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
}
