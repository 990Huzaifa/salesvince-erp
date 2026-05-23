import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { OrderStatus } from 'src/tenant-db/entities/purchase-order.entity';
import { PurchaseOrderService } from '../service/purchase/purchase-order.service';
import { CreatePurchaseOrderDto } from '../dto/purchase-order/create-purchase-order.dto';
import { CreateSimplePurchaseOrderDto } from '../dto/purchase-order/create-simple-purchase-order.dto';
import { UpdatePurchaseOrderDto } from '../dto/purchase-order/update-purchase-order.dto';

@Controller('tenant/purchase-orders')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post('create')
  @RequirePermissions('CREATE_PURCHASE_ORDER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-simple')
  @RequirePermissions('CREATE_PURCHASE_ORDER')
  createSimple(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSimplePurchaseOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.createSimple(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_PURCHASE_ORDER')
  createAndApproved(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.createAndApproved(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-approve-and-purchase')
  @RequirePermissions('APPROVE_PURCHASE_ORDER')
  createApproveAndPurchase(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.createApproveAndPurchase(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PURCHASE_ORDER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('vendorId') vendorId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('orderStatus') orderStatus?: OrderStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        vendorId,
        warehouseId,
        orderStatus,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_ORDER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PURCHASE_ORDER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_ORDER')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_PURCHASE_ORDER')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseOrderService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
