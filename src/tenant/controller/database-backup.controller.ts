import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection, TenantId } from 'src/common/tenant/tenant-connection.decorator';
import { DatabaseBackupTrigger } from 'src/tenant-db/entities/database-backup.entity';
import { TenantDatabaseBackupService } from '../service/tenant-database-backup.service';

@Controller('tenant/backups')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantPermissionGuard,
)
export class DatabaseBackupController {
  constructor(private readonly backupService: TenantDatabaseBackupService) {}

  @Get()
  @RequirePermissions('LIST_DATABASE_BACKUP')
  listBackups(@TenantConnection() tenantDb: DataSource, @TenantId() tenantId: string) {
    return this.backupService.listBackups(tenantDb, tenantId);
  }

  @Post('trigger')
  @RequirePermissions('TRIGGER_DATABASE_BACKUP')
  async triggerBackup(@TenantId() tenantId: string) {
    const result = await this.backupService.runBackupForTenant(
      tenantId,
      DatabaseBackupTrigger.MANUAL,
    );
    if (result.skipped === true) {
      return {
        message: 'Backup was not started',
        reason: result.reason,
      };
    }
    return {
      message: 'Database backup completed',
      backup: result.backup,
    };
  }

  @Get(':id/download')
  @RequirePermissions('DOWNLOAD_DATABASE_BACKUP')
  downloadBackup(@TenantConnection() tenantDb: DataSource, @Param('id') id: string) {
    return this.backupService.getDownloadUrl(tenantDb, id);
  }

  @Get(':id')
  @RequirePermissions('VIEW_DATABASE_BACKUP')
  viewBackup(@TenantConnection() tenantDb: DataSource, @Param('id') id: string) {
    return this.backupService.getBackupById(tenantDb, id);
  }
}
