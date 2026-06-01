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
import { PurchaseReturnService } from '../../service/purchase/purchase-return.service';
import { CreatePurchaseReturnDto } from '../../dto/purchase-return/create-purchase-return.dto';
import { UpdatePurchaseReturnDto } from '../../dto/purchase-return/update-purchase-return.dto';

@Controller('tenant/purchase-returns')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PurchaseReturnController {
  constructor(private readonly purchaseReturnService: PurchaseReturnService) {}

  @Post('create')
  @RequirePermissions('CREATE_PURCHASE_RETURN')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseReturnService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PURCHASE_RETURN')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('purchaseInvoiceId') purchaseInvoiceId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseReturnService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        purchaseInvoiceId,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_RETURN')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseReturnService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PURCHASE_RETURN')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseReturnService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_RETURN')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseReturnService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
