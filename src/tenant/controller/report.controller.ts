import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ReportService } from '../service/report.service';

@Controller('tenant/reports')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('cash-bank-balances')
  getCashAndBankBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getCashAndBankBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('customer-balances')
  getCustomerBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getCustomerBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('vendor-balances')
  getVendorBalances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.reportService.getVendorBalances(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }
}
