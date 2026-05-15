import { Controller, Get, Param, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { NotificationService } from '../service/notification.service';

type TenantRequestUser = {
  userId?: string;
};

@Controller('tenant/notifications')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard, TenantPermissionGuard)
export class TenantNotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  private getUserId(req: Request): string {
    const user = req.user as TenantRequestUser;
    if (!user?.userId) {
      throw new UnauthorizedException('Tenant user not found in request');
    }
    return user.userId;
  }

  @Get('')
  list(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    return this.notificationService.getUserNotifications(tenantDb, this.getUserId(req));
  }

  @Put(':id/read')
  markAsRead(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
  ) {
    return this.notificationService.markAsRead(tenantDb, id);
  }
}
