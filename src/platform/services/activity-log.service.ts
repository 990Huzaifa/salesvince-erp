import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLog, ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { Repository } from 'typeorm';
import { CreateActivityLogDto } from '../dto/activity-log/create-activity-log.dto';

@Injectable()
export class ActivityLogService {
    constructor(
        @InjectRepository(ActivityLog)
        private readonly activityLogRepo: Repository<ActivityLog>,
    ) { }

    async recordActivityLog(payload: CreateActivityLogDto) {
        const log = this.activityLogRepo.create({
            actorType: payload.actorType,
            actorId: payload.actorId ?? null,
            tenantId: payload.tenantId ?? null,
            action: payload.action,
            description: payload.description ?? null,
            metadata: payload.metadata ?? null,
            jobId: payload.jobId ?? null,
        });

        return this.activityLogRepo.save(log);
    }

    // Easy helper for system-generated logs.
    async recordSystemActivity(
        action: string,
        options?: Omit<CreateActivityLogDto, 'action' | 'actorType' | 'actorId'>,
    ) {
        return this.recordActivityLog({
            actorType: ActivityLogActorType.SYSTEM,
            actorId: null,
            action,
            tenantId: options?.tenantId,
            description: options?.description,
            metadata: options?.metadata,
            jobId: options?.jobId,
        });
    }

    async listActivityLogs(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const [logs, total] = await this.activityLogRepo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
            relations: ['actor', 'tenant'],
            select: {
                id: true,
                actorType: true,
                actorId: true,
                tenantId: true,
                action: true,
                description: true,
                metadata: true,
                jobId: true,
                createdAt: true,
                updatedAt: true,
                actor: {
                    id: true,
                    fullName: true,
                    email: true,
                },
                tenant: {
                    id: true,
                    name: true,
                    code: true,
                    email: true,
                },
            },
        });

        return {
            data: logs,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async viewActivityLog(id: string) {
        const log = await this.activityLogRepo.findOne({
            where: { id },
            relations: ['actor', 'tenant'],
            select: {
                id: true,
                actorType: true,
                actorId: true,
                tenantId: true,
                action: true,
                description: true,
                metadata: true,
                jobId: true,
                createdAt: true,
                updatedAt: true,
                actor: {
                    id: true,
                    fullName: true,
                    email: true,
                },
                tenant: {
                    id: true,
                    name: true,
                    code: true,
                    email: true,
                },
            },
        });

        if (!log) {
            throw new NotFoundException('Activity log not found');
        }

        return log;
    }
}
