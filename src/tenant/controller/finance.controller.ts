import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { FinanceService } from '../service/finance.service';

@Controller('tenant/finance')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('ledger')
  getLedger(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('chartOfAccountId') chartOfAccountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.financeService.getLedger(
      tenantDb,
      user.businessId,
      { chartOfAccountId, startDate, endDate },
      user.userId,
    );
  }

  @Get('advance-ledger')
  getAdvanceLedger(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('chartOfAccountId') chartOfAccountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortOrder') sortOrder?: 'credit_first' | 'debit_first',
  ) {
    const user = req.user as TenantRequestUser;
    return this.financeService.getAdvanceLedger(
      tenantDb,
      user.businessId,
      { chartOfAccountId, startDate, endDate, sortOrder },
      user.userId,
    );
  }
}
