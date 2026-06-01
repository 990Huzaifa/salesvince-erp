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
import { SaleReturnStatus } from 'src/tenant-db/entities/sale-return.entity';
import { SaleReturnService } from '../../service/sale/sale-return.service';
import { CreateSaleReturnDto } from '../../dto/sale-return/create-sale-return.dto';
import { UpdateSaleReturnDto } from '../../dto/sale-return/update-sale-return.dto';

@Controller('tenant/sale-returns')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleReturnController {
  constructor(private readonly saleReturnService: SaleReturnService) {}

  @Post('create')
  @RequirePermissions('CREATE_SALE_RETURN')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_SALE_RETURN')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSaleReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.createAndApprove(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALE_RETURN')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('saleInvoiceId') saleInvoiceId?: string,
    @Query('status') status?: SaleReturnStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        saleInvoiceId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_RETURN')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_SALE_RETURN')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALE_RETURN')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleReturnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SALE_RETURN')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleReturnService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
