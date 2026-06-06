import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
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
import { GetStockBalanceDto } from '../dto/inventory/get-stock-balance.dto';
import { GetBatchDetailDto } from '../dto/inventory/get-batch-detail.dto';
import { GetStockMovementDto } from '../dto/inventory/get-stock-movement.dto';
import { CreateProductMergeDto } from '../dto/inventory/create-product-merge.dto';
import { InventoryBalanceService } from '../service/inventory/inventory-balance.service';
import { InventoryBatchService } from '../service/inventory/inventory-batch.service';
import { InventoryMovementService } from '../service/inventory/inventory-movement.service';
import { ProductMergeService } from '../service/inventory/product-merge.service';

@Controller('tenant/inventory')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class InventoryController {
  constructor(
    private readonly inventoryBalanceService: InventoryBalanceService,
    private readonly inventoryBatchService: InventoryBatchService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly productMergeService: ProductMergeService,
  ) {}

  @Get('stock-balance')
  @RequirePermissions('LIST_INVENTORY')
  stockBalance(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: GetStockBalanceDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryBalanceService.list(tenantDb, user.businessId, query);
  }

  @Get('batches')
  @RequirePermissions('LIST_INVENTORY')
  batches(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: GetBatchDetailDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryBatchService.list(tenantDb, user.businessId, query);
  }

  @Get('stock-movements')
  @RequirePermissions('LIST_INVENTORY')
  stockMovements(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: GetStockMovementDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryMovementService.list(tenantDb, user.businessId, query);
  }

  @Post('product-merge')
  @RequirePermissions('CREATE_PRODUCT_MERGE')
  productMerge(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Body() dto: CreateProductMergeDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.productMergeService.merge(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }
}
