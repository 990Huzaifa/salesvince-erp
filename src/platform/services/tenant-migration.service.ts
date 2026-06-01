import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tenant, TenantStatus } from 'src/master-db/entities/tenant.entity';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDatabaseService } from 'src/tenant-db/services/tenant-database.service';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogActorType } from 'src/master-db/entities/activity-log.entity';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';

const ELIGIBLE_STATUSES = [TenantStatus.PROVISIONED, TenantStatus.SUSPENDED];

export type TenantMigrationResultStatus = 'success' | 'failed' | 'skipped';

export interface TenantMigrationResult {
    tenantId: string;
    tenantCode?: string;
    status: TenantMigrationResultStatus;
    executedMigrations?: string[];
    error?: string;
    reason?: string;
}

@Injectable()
export class TenantMigrationService {
    private readonly logger = new Logger(TenantMigrationService.name);

    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(TenantDbConfig)
        private readonly dbConfigRepo: Repository<TenantDbConfig>,
        private readonly tenantDatabaseService: TenantDatabaseService,
        private readonly activityLogService: ActivityLogService,
    ) {}

    async runTenantMigrations(tenantId?: string, actor?: PlatformUser) {
        if (tenantId) {
            const result = await this.runForTenantId(tenantId);
            await this.recordMigrationActivity(actor, 'single', [result], tenantId);
            return result;
        }

        const results = await this.runForAllTenants();
        const summary = this.buildSummary(results);
        await this.recordMigrationActivity(actor, 'all', results);

        return { summary, results };
    }

    private async runForTenantId(tenantId: string): Promise<TenantMigrationResult> {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        if (!tenant) {
            throw new NotFoundException('Tenant not found');
        }

        const dbConfig = await this.dbConfigRepo.findOne({
            where: { tenant: { id: tenantId } },
            relations: ['tenant'],
        });

        if (!dbConfig) {
            throw new NotFoundException('Tenant database not provisioned');
        }

        if (!ELIGIBLE_STATUSES.includes(tenant.status)) {
            return {
                tenantId: tenant.id,
                tenantCode: tenant.code,
                status: 'skipped',
                reason: `Tenant status ${tenant.status} is not eligible for migrations`,
            };
        }

        return this.runForConfig(tenant, dbConfig);
    }

    private async runForAllTenants(): Promise<TenantMigrationResult[]> {
        const configs = await this.dbConfigRepo.find({
            relations: ['tenant'],
            where: { tenant: { status: In(ELIGIBLE_STATUSES) } },
        });

        const results: TenantMigrationResult[] = [];

        for (const dbConfig of configs) {
            const tenant = dbConfig.tenant;
            if (!tenant) {
                results.push({
                    tenantId: 'unknown',
                    status: 'skipped',
                    reason: 'Tenant relation missing on db config',
                });
                continue;
            }

            results.push(await this.runForConfig(tenant, dbConfig));
        }

        return results;
    }

    private async runForConfig(
        tenant: Tenant,
        dbConfig: TenantDbConfig,
    ): Promise<TenantMigrationResult> {
        try {
            const executedMigrations = await this.tenantDatabaseService.runMigrations(
                dbConfig.host,
                Number(dbConfig.port),
                dbConfig.username,
                dbConfig.password,
                dbConfig.database,
            );

            return {
                tenantId: tenant.id,
                tenantCode: tenant.code,
                status: 'success',
                executedMigrations,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Tenant migration failed for tenant ${tenant.id}: ${message}`,
            );

            return {
                tenantId: tenant.id,
                tenantCode: tenant.code,
                status: 'failed',
                error: message,
            };
        }
    }

    private buildSummary(results: TenantMigrationResult[]) {
        return {
            total: results.length,
            succeeded: results.filter((r) => r.status === 'success').length,
            failed: results.filter((r) => r.status === 'failed').length,
            skipped: results.filter((r) => r.status === 'skipped').length,
        };
    }

    private async recordMigrationActivity(
        actor: PlatformUser | undefined,
        mode: 'single' | 'all',
        results: TenantMigrationResult[],
        tenantId?: string,
    ) {
        if (!actor) {
            return;
        }

        const summary = this.buildSummary(results);

        await this.activityLogService.recordActivityLog({
            actorType: ActivityLogActorType.PLATFORM_USER,
            actorId: actor.id,
            tenantId: tenantId ?? null,
            action: 'TENANT_MIGRATE',
            description:
                mode === 'single'
                    ? 'Tenant database migrations executed'
                    : 'Tenant database migrations executed for all tenants',
            metadata: { mode, ...summary },
        });
    }
}
