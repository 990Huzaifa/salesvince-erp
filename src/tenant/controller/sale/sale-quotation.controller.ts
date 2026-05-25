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
import { SaleQuotationService } from '../../service/sale/sale-quotation.service';
import { CreateSaleQuotationDto } from '../../dto/sale-quotation/create-sale-quotation.dto';
import { UpdateSaleQuotationDto } from '../../dto/sale-quotation/update-sale-quotation.dto';

@Controller('tenant/sale-quotations')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleQuotationController {
  constructor(private readonly saleQuotationService: SaleQuotationService) {}

  @Post('create')
  @RequirePermissions('CREATE_SALE_QUOTATION')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleQuotationDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleQuotationService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALE_QUOTATION')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleQuotationService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        customerId,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_QUOTATION')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleQuotationService.getById(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_QUOTATION')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleQuotationDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleQuotationService.update(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SALE_QUOTATION')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleQuotationService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
