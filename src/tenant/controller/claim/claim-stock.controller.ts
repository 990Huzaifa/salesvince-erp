import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
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
import { ClaimStockService } from '../../service/claim/claim-stock.service';

@Controller('tenant/claim-stock')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimStockController {
  constructor(private readonly claimStockService: ClaimStockService) {}

  @Get('batches')
  @RequirePermissions('LIST_CLAIM_STOCK')
  listBatches(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('claimId') claimId?: string,
    @Query('search') search?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimStockService.listBatches(tenantDb, user.businessId, {
      page,
      limit,
      claimId,
      search,
    });
  }

  @Get('balances')
  @RequirePermissions('LIST_CLAIM_STOCK')
  listStock(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimStockService.listStock(tenantDb, user.businessId, {
      page,
      limit,
      warehouseId,
      search,
    });
  }
}
