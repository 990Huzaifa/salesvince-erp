import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { PurchaseInvoiceService } from '../service/purchase/purchase-invoice.service';

@Controller('tenant/purchase-invoices')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PurchaseInvoiceController {
  constructor(
    private readonly purchaseInvoiceService: PurchaseInvoiceService,
  ) {}

  @Get()
  @RequirePermissions('LIST_PURCHASE_INVOICE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('grnId') grnId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseInvoiceService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        grnId,
        purchaseOrderId,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_INVOICE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseInvoiceService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
