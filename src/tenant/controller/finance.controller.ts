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
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { FinanceService } from '../service/finance.service';
import {
  FinanceAdvanceLedgerQueryDto,
  FinanceLedgerQueryDto,
} from '../dto/finance/finance-ledger.query.dto';

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
  @RequirePermissions('VIEW_LEDGER')
  getLedger(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: FinanceLedgerQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.financeService.getLedger(
      tenantDb,
      user.businessId,
      {
        chartOfAccountId: query.chartOfAccountId,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }

  @Get('advance-ledger')
  @RequirePermissions('VIEW_ADVANCE_LEDGER')
  getAdvanceLedger(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: FinanceAdvanceLedgerQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.financeService.getAdvanceLedger(
      tenantDb,
      user.businessId,
      {
        chartOfAccountId: query.chartOfAccountId,
        startDate: query.startDate,
        endDate: query.endDate,
        sortOrder: query.sortOrder,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
      user.userId,
    );
  }
}
