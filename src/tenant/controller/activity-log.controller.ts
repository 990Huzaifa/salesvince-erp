import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ActivityLogService } from '../service/activity-log.service';

@Controller('tenant/activity-logs')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @RequirePermissions('LIST_ACTIVITY_LOG')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const user = req.user as TenantRequestUser;
    return this.activityLogService.listActivityLogs(
      tenantDb,
      user.businessId,
      page ?? 1,
      limit ?? 10,
    );
  }

  @Get(':id')
  @RequirePermissions('LIST_ACTIVITY_LOG')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.activityLogService.viewActivityLog(
      tenantDb,
      user.businessId,
      id,
    );
  }
}
