import {
  Body,
  Controller,
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
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import { SaleVoucherService } from '../../service/vouchers/sale-voucher.service';
import {
  CreateSaleVouchersDto,
  UpdateSaleVoucherDto,
} from '../../dto/voucher/sale-voucher.dto';

@Controller('tenant/sale-vouchers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleVoucherController {
  constructor(private readonly saleVoucherService: SaleVoucherService) {}

  @Post('create')
  @RequirePermissions('CREATE_SALE_VOUCHER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleVouchersDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleVoucherService.create(
      tenantDb,
      user.businessId!,
      dto.vouchers,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_SALE_VOUCHER')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleVouchersDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleVoucherService.createAndApprove(
      tenantDb,
      user.businessId!,
      dto.vouchers,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALE_VOUCHER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: VoucherStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleVoucherService.list(
      tenantDb,
      user.businessId!,
      { page: Number(page), limit: Number(limit), search, status },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_VOUCHER')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleVoucherService.getById(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_VOUCHER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleVoucherDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleVoucherService.edit(
      tenantDb,
      user.businessId!,
      id,
      dto,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_SALE_VOUCHER')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleVoucherService.approve(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }
}
