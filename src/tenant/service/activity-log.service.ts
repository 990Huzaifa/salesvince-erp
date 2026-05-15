import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateActivityLogDto } from '../dto/activity-log/create-activity-log.dto';
import { ActivityLog } from 'src/tenant-db/entities/activity-log.entity';
import { S3Service } from 'src/common/s3/s3.service';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';

@Injectable()
export class ActivityLogService {
    private readonly logger = new Logger(ActivityLogService.name);

    constructor(
        private readonly s3Service: S3Service,
        private readonly tenantConnectionManager: TenantConnectionManager,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
    ) { }

    async recordActivityLog(tenantDb: DataSource, payload: CreateActivityLogDto) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const log = activityLogRepo.create({
            actorId: payload.actorId ?? null,
            action: payload.action,
            description: payload.description ?? null,
            metadata: payload.metadata ?? null,
            jobId: payload.jobId ?? null,
        });

        return activityLogRepo.save(log);
    }

    // Easy helper for system-generated logs.
    async recordSystemActivity(
        tenantDb: DataSource,
        action: string,
        options?: Omit<CreateActivityLogDto, 'action' | 'actorId'>,
    ) {
        return this.recordActivityLog(tenantDb, {
            actorId: null,
            action,
            description: options?.description,
            metadata: options?.metadata,
            jobId: options?.jobId,
        });
    }

    async listActivityLogs(tenantDb: DataSource, page = 1, limit = 10) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const skip = (page - 1) * limit;
        const [logs, total] = await activityLogRepo.findAndCount({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
            relations: ['actor'],
            select: {
                id: true,
                actorId: true,
                action: true,
                description: true,
                metadata: true,
                jobId: true,
                createdAt: true,
                updatedAt: true,
                actor: {
                    id: true,
                    name: true,
                    email: true,
                }
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

    async viewActivityLog(tenantDb: DataSource, id: string) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const log = await activityLogRepo.findOne({
            where: { id },
            relations: ['actor'],
            select: {
                id: true,
                actorId: true,
                action: true,
                description: true,
                metadata: true,
                jobId: true,
                createdAt: true,
                updatedAt: true,
                actor: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        });

        if (!log) {
            throw new NotFoundException('Activity log not found');
        }

        return log;
    }

    @Cron(CronExpression.EVERY_WEEK)
    async archiveAndClearActivityLogsWeekly() {
        const tenants = await this.tenantRepo.find({
            where: { isActive: true },
            select: { id: true, code: true },
        });

        for (const tenant of tenants) {
            try {
                const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
                const archivedCount = await this.archiveAndClearTenantLogs(tenantDb, tenant.code);
                if (archivedCount > 0) {
                    this.logger.log(
                        `Archived and cleared ${archivedCount} activity logs for tenant ${tenant.code}`,
                    );
                }
            } catch (error) {
                this.logger.error(
                    `Weekly activity log archive failed for tenant ${tenant.code}`,
                    error instanceof Error ? error.stack : undefined,
                );
            }
        }
    }

    private async archiveAndClearTenantLogs(tenantDb: DataSource, tenantCode: string) {
        const activityLogRepo = tenantDb.getRepository(ActivityLog);
        const totalLogs = await activityLogRepo.count();

        if (totalLogs === 0) {
            return 0;
        }

        const exportDate = new Date();
        const exportDateIso = exportDate.toISOString().slice(0, 10);
        const fileName = `activity-logs-${tenantCode}-${exportDateIso}.txt`;
        // const s3Key = `archives/activity-logs/${tenantCode}/${fileName}`;
        const s3Key = `tenants/${tenantCode}/activity-logs/${fileName}`;

        const lines: string[] = [
            `tenant=${tenantCode}`,
            `exportedAt=${exportDate.toISOString()}`,
            `totalRecords=${totalLogs}`,
            '',
        ];

        const batchSize = 1000;
        for (let offset = 0; offset < totalLogs; offset += batchSize) {
            const logs = await activityLogRepo.find({
                order: { createdAt: 'ASC' },
                skip: offset,
                take: batchSize,
            });

            for (const log of logs) {
                lines.push(
                    JSON.stringify({
                        id: log.id,
                        actorId: log.actorId,
                        action: log.action,
                        description: log.description,
                        metadata: log.metadata,
                        jobId: log.jobId,
                        createdAt: log.createdAt,
                        updatedAt: log.updatedAt,
                    }),
                );
            }
        }

        const payload = `${lines.join('\n')}\n`;
        await this.s3Service.uploadObject(s3Key, payload, 'text/plain; charset=utf-8');

        await activityLogRepo
            .createQueryBuilder()
            .delete()
            .from(ActivityLog)
            .execute();

        return totalLogs;
    }
}
