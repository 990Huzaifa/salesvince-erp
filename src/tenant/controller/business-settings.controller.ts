import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
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
import { UpdateBusinessSettingsDto } from '../dto/business-settings/update-business-settings.dto';
import { BusinessSettingsService } from '../service/business-settings.service';

@Controller('tenant/business-settings')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class BusinessSettingsController {
  constructor(
    private readonly businessSettingsService: BusinessSettingsService,
  ) {}

  @Get()
  @RequirePermissions('VIEW_BUSINESS_SETTINGS')
  get(@TenantConnection() tenantDb: DataSource, @Req() req: Request) {
    const user = req.user as TenantRequestUser;
    return this.businessSettingsService.get(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Put()
  @RequirePermissions('UPDATE_BUSINESS_SETTINGS')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: UpdateBusinessSettingsDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.businessSettingsService.update(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }
}
