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
import { OrderStatus } from 'src/tenant-db/entities/sale-order.entity';
import { SaleOrderService } from '../../service/sale/sale-order.service';
import { CreateSaleOrderDto } from '../../dto/sale-order/create-sale-order.dto';
import { UpdateSaleOrderDto } from '../../dto/sale-order/update-sale-order.dto';
import { EditApprovedSaleOrderDto } from '../../dto/sale-order/edit-approved-sale-order.dto';

@Controller('tenant/sale-orders')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleOrderController {
  constructor(private readonly saleOrderService: SaleOrderService) {}

  @Post('create')
  @RequirePermissions('CREATE_SALE_ORDER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_SALE_ORDER')
  createAndApproved(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.createAndApproved(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-approve-and-sale')
  @RequirePermissions('APPROVE_SALE_ORDER')
  createApproveAndSale(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.createApproveAndSale(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALE_ORDER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query('orderStatus') orderStatus?: OrderStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        customerId,
        orderStatus,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_ORDER')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_ORDER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Put('edit-approved/:id')
  @RequirePermissions('UPDATE_SALE_ORDER')
  editApproved(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditApprovedSaleOrderDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.editApproved(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SALE_ORDER')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_SALE_ORDER')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleOrderService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
