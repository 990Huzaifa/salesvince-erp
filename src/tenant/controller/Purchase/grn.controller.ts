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
import { GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { GrnService } from '../../service/purchase/grn.service';
import { CreateGrnDto } from '../../dto/grn/create-grn.dto';
import { UpdateGrnDto } from '../../dto/grn/update-grn.dto';

@Controller('tenant/grns')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class GrnController {
  constructor(private readonly grnService: GrnService) {}

  @Post('create')
  @RequirePermissions('CREATE_PURCHASE_STOCK')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateGrnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_PURCHASE_STOCK')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateGrnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.create(
      tenantDb,
      user.businessId,
      { ...dto, status: GrnStatus.APPROVED },
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PURCHASE_STOCK')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('vendorId') vendorId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
    @Query('status') status?: GrnStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        vendorId,
        warehouseId,
        purchaseOrderId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PURCHASE_STOCK')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PURCHASE_STOCK')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGrnDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PURCHASE_STOCK')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_PURCHASE_STOCK')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.grnService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
