import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { S3Service } from 'src/common/s3/s3.service';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import {
  DatabaseBackup,
  DatabaseBackupStatus,
  DatabaseBackupTrigger,
} from 'src/tenant-db/entities/database-backup.entity';
import { TenantDbConnectionAdapter } from 'src/sql-agent/adapters/tenant-db-connection.adapter';
import { MasterTenantDataService } from './master-tenant-data.service';
import { PgDumpService } from './pg-dump.service';
import { ActivityLogService } from './activity-log.service';

const PRESIGNED_DOWNLOAD_EXPIRES_SEC = 15 * 60;
const MANUAL_BACKUP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FAILED_BACKUP_RETENTION_DAYS = 30;
const TENANT_BACKUP_DELAY_MS = 2000;

@Injectable()
export class TenantDatabaseBackupService {
  private readonly logger = new Logger(TenantDatabaseBackupService.name);
  private isBackupCronRunning = false;

  constructor(
    private readonly s3Service: S3Service,
    private readonly pgDumpService: PgDumpService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly tenantDbConnectionAdapter: TenantDbConnectionAdapter,
    private readonly masterTenantDataService: MasterTenantDataService,
    private readonly activityLogService: ActivityLogService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  @Cron('0 2 * * *')
  async runDailyBackups() {
    if (process.env.BACKUP_CRON_ENABLED !== 'true') {
      return;
    }
    await this.processAllTenantBackups(DatabaseBackupTrigger.SCHEDULED);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async testBackupCronJob() {
    if (process.env.BACKUP_TEST_CRON_ENABLED !== 'true') {
      return;
    }
    this.logger.log('Backup test cron triggered');
    await this.processAllTenantBackups(DatabaseBackupTrigger.SCHEDULED);
  }

  async runBackupTestNow(tenantId: string) {
    return this.runBackupForTenant(tenantId, DatabaseBackupTrigger.MANUAL);
  }

  async processAllTenantBackups(trigger: DatabaseBackupTrigger) {
    if (this.isBackupCronRunning) {
      this.logger.warn('Backup cron skipped: previous run still in progress');
      return;
    }

    this.isBackupCronRunning = true;
    const source = trigger === DatabaseBackupTrigger.SCHEDULED ? 'scheduled-cron' : 'manual-batch';

    try {
      const tenants = await this.tenantRepo.find({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      let processedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const tenant of tenants) {
        try {
          const result = await this.runBackupForTenant(tenant.id, trigger);
          if ('skipped' in result && result.skipped) {
            skippedCount += 1;
          } else {
            processedCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          this.logger.error(
            `Backup failed for tenant ${tenant.code}`,
            error instanceof Error ? error.stack : undefined,
          );
        }

        if (TENANT_BACKUP_DELAY_MS > 0) {
          await this.delay(TENANT_BACKUP_DELAY_MS);
        }
      }

      await this.cleanupOldFailedBackupsForAllTenants(tenants);

      this.logger.log(
        `Backup cron finished (${source}): processed=${processedCount}, skipped=${skippedCount}, failed=${failedCount}`,
      );
    } finally {
      this.isBackupCronRunning = false;
    }
  }

  async runBackupForTenant(
    tenantId: string,
    trigger: DatabaseBackupTrigger,
  ): Promise<{ skipped: true; reason: string } | { skipped: false; backup: DatabaseBackup }> {
    const retentionLimit = await this.masterTenantDataService.getBackupRetentionLimit(tenantId);
    if (retentionLimit <= 0) {
      if (trigger === DatabaseBackupTrigger.MANUAL) {
        throw new ForbiddenException('Database backup is not available on your current plan');
      }
      return { skipped: true, reason: 'no_backup_feature' };
    }

    const tenantCode = await this.masterTenantDataService.getTenantCodeByTenantId(tenantId);
    if (!tenantCode) {
      throw new NotFoundException('Tenant not found');
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(tenantId);
    const backupRepo = tenantDb.getRepository(DatabaseBackup);
    const backupDate = this.todayDateString();

    if (trigger === DatabaseBackupTrigger.SCHEDULED) {
      const existingToday = await backupRepo.findOne({
        where: {
          backupDate,
          trigger: DatabaseBackupTrigger.SCHEDULED,
          status: DatabaseBackupStatus.COMPLETED,
        },
      });
      if (existingToday) {
        return { skipped: true, reason: 'scheduled_backup_already_exists' };
      }
    }

    if (trigger === DatabaseBackupTrigger.MANUAL) {
      await this.assertManualBackupAllowed(backupRepo);
    }

    const pendingCount = await backupRepo.count({
      where: { status: DatabaseBackupStatus.PENDING },
    });
    if (pendingCount > 0) {
      if (trigger === DatabaseBackupTrigger.MANUAL) {
        throw new ConflictException('A database backup is already in progress');
      }
      return { skipped: true, reason: 'backup_in_progress' };
    }

    const backup = backupRepo.create({
      backupDate,
      s3Key: null,
      fileSize: null,
      status: DatabaseBackupStatus.PENDING,
      trigger,
      errorMessage: null,
    });
    await backupRepo.save(backup);

    if (trigger === DatabaseBackupTrigger.MANUAL) {
      await this.activityLogService.recordSystemActivity(tenantDb, 'DATABASE_BACKUP_MANUAL_TRIGGERED', {
        description: 'Manual database backup started',
        metadata: { backupId: backup.id },
      });
    }

    const s3Key = `tenants/${tenantCode}/db-backups/${backupDate}-${backup.id}.sql.gz`;

    try {
      const dbConfig = await this.tenantDbConnectionAdapter.getConnectionConfig(tenantId);
      const gzippedDump = await this.pgDumpService.dumpDatabaseGzipped(dbConfig);

      await this.s3Service.uploadObject(s3Key, gzippedDump, 'application/gzip');

      backup.s3Key = s3Key;
      backup.fileSize = String(gzippedDump.length);
      backup.status = DatabaseBackupStatus.COMPLETED;
      backup.errorMessage = null;
      await backupRepo.save(backup);

      await this.pruneOldBackups(backupRepo, retentionLimit);

      await this.activityLogService.recordSystemActivity(tenantDb, 'DATABASE_BACKUP_COMPLETED', {
        description: `${trigger} database backup completed`,
        metadata: {
          backupId: backup.id,
          backupDate,
          fileSize: backup.fileSize,
          trigger,
        },
      });

      return { skipped: false, backup };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown backup error';
      backup.status = DatabaseBackupStatus.FAILED;
      backup.errorMessage = message;
      await backupRepo.save(backup);

      await this.activityLogService.recordSystemActivity(tenantDb, 'DATABASE_BACKUP_FAILED', {
        description: `${trigger} database backup failed`,
        metadata: { backupId: backup.id, error: message, trigger },
      });

      throw error;
    }
  }

  async listBackups(tenantDb: DataSource, tenantId: string) {
    const retentionLimit = await this.masterTenantDataService.getBackupRetentionLimit(tenantId);
    const featureEnabled = retentionLimit > 0;
    const backupRepo = tenantDb.getRepository(DatabaseBackup);

    const [data, usedCount] = await backupRepo.findAndCount({
      where: { status: DatabaseBackupStatus.COMPLETED },
      order: { backupDate: 'DESC', createdAt: 'DESC' },
      take: featureEnabled ? retentionLimit : 0,
    });

    return {
      data,
      retentionLimit,
      usedCount,
      featureEnabled,
    };
  }

  async getBackupById(tenantDb: DataSource, id: string) {
    const backupRepo = tenantDb.getRepository(DatabaseBackup);
    const backup = await backupRepo.findOne({ where: { id } });
    if (!backup) {
      throw new NotFoundException('Database backup not found');
    }
    return backup;
  }

  async getDownloadUrl(tenantDb: DataSource, id: string) {
    const backup = await this.getBackupById(tenantDb, id);
    if (backup.status !== DatabaseBackupStatus.COMPLETED || !backup.s3Key) {
      throw new ConflictException('Backup is not available for download');
    }

    const downloadUrl = await this.s3Service.getPresignedGetObjectUrl(
      backup.s3Key,
      PRESIGNED_DOWNLOAD_EXPIRES_SEC,
    );

    return {
      backupId: backup.id,
      downloadUrl,
      expiresInSeconds: PRESIGNED_DOWNLOAD_EXPIRES_SEC,
      fileName: backup.s3Key.split('/').pop(),
    };
  }

  private async assertManualBackupAllowed(backupRepo: Repository<DatabaseBackup>) {
    const since = new Date(Date.now() - MANUAL_BACKUP_COOLDOWN_MS);
    const recentManual = await backupRepo.findOne({
      where: {
        trigger: DatabaseBackupTrigger.MANUAL,
        status: DatabaseBackupStatus.COMPLETED,
      },
      order: { createdAt: 'DESC' },
    });

    if (recentManual && recentManual.createdAt >= since) {
      throw new ConflictException('Manual backup is limited to once every 24 hours');
    }
  }

  private async pruneOldBackups(
    backupRepo: Repository<DatabaseBackup>,
    retentionLimit: number,
  ) {
    const completedCount = await backupRepo.count({
      where: { status: DatabaseBackupStatus.COMPLETED },
    });

    if (completedCount <= retentionLimit) {
      return;
    }

    const excess = completedCount - retentionLimit;
    const oldest = await backupRepo.find({
      where: { status: DatabaseBackupStatus.COMPLETED },
      order: { backupDate: 'ASC', createdAt: 'ASC' },
      take: excess,
    });

    for (const row of oldest) {
      if (row.s3Key) {
        try {
          await this.s3Service.deleteObject(row.s3Key);
        } catch (error) {
          this.logger.error(
            `Failed to delete S3 object ${row.s3Key}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
      await backupRepo.remove(row);
    }
  }

  private async cleanupOldFailedBackupsForAllTenants(
    tenants: Pick<Tenant, 'id' | 'code'>[],
  ) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FAILED_BACKUP_RETENTION_DAYS);

    for (const tenant of tenants) {
      try {
        const tenantDb = await this.tenantConnectionManager.getConnection(tenant.id);
        const backupRepo = tenantDb.getRepository(DatabaseBackup);
        const staleFailed = await backupRepo.find({
          where: {
            status: DatabaseBackupStatus.FAILED,
            createdAt: LessThan(cutoff),
          },
        });

        if (staleFailed.length > 0) {
          await backupRepo.remove(staleFailed);
          this.logger.log(
            `Removed ${staleFailed.length} stale failed backup rows for tenant ${tenant.code}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed backup cleanup for tenant ${tenant.code}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private todayDateString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
