import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantLoginOnlyGuard } from 'src/auth/tenant-login-only.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantSuperAdminGuard } from 'src/auth/tenant-super-admin.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { AdminDashboardService } from '../service/admin-dashboard.service';
import { AdminDashboardQueryDto } from '../dto/dashboard/admin-dashboard.query.dto';

@Controller('tenant/admin-dashboard')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantLoginOnlyGuard,
  TenantSuperAdminGuard,
  TenantPermissionGuard,
)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  @RequirePermissions('VIEW_ADMIN_DASHBOARD')
  getDashboard(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: AdminDashboardQueryDto,
  ) {
    return this.adminDashboardService.getDashboard(
      tenantDb,
      req.user as TenantRequestUser,
      query,
    );
  }
}
