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
import { PurchaseQuotationService } from '../../service/purchase/purchase-quotation.service';
import { CreatePurchaseQuotationDto } from '../../dto/purchase-quotation/create-purchase-quotation.dto';
import { UpdatePurchaseQuotationDto } from '../../dto/purchase-quotation/update-purchase-quotation.dto';

@Controller('tenant/purchase-quotations')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PurchaseQuotationController {
  constructor(
    private readonly purchaseQuotationService: PurchaseQuotationService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_PURCHASE_QUOTATION')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePurchaseQuotationDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseQuotationService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PURCHASE_QUOTATION')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('vendorId') vendorId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseQuotationService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        vendorId,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_QUOTATION')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseQuotationService.getById(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PURCHASE_QUOTATION')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseQuotationDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseQuotationService.update(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_QUOTATION')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.purchaseQuotationService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
