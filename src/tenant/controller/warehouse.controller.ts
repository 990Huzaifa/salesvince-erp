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
import { WarehouseService } from '../service/warehouse.service';
import { WarehousePurgeService } from '../service/warehouse-purge.service';
import { CreateWarehouseDto } from '../dto/warehouse/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/warehouse/update-warehouse.dto';
import { PurgeWarehouseDto } from '../dto/warehouse/purge-warehouse.dto';

@Controller('tenant/warehouses')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
)
export class WarehouseController {
  constructor(
    private readonly warehouseService: WarehouseService,
    private readonly warehousePurgeService: WarehousePurgeService,
  ) {}

  /**
   * Destructive: removes all warehouse-linked operational data, then soft-deletes the warehouse.
   * No TenantPermissionGuard — JWT + tenant + business access only.
   */
  @Post('purge')
  purge(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: PurgeWarehouseDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.warehousePurgeService.purgeByCode(
      tenantDb,
      user.businessId,
      dto.warehouseCode,
      user.userId,
    );
  }

  @Post('create')
  @UseGuards(TenantPermissionGuard)
  @RequirePermissions('CREATE_WAREHOUSE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateWarehouseDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.warehouseService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @UseGuards(TenantPermissionGuard)
  @RequirePermissions('LIST_WAREHOUSE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('cityId') cityId?: string,
    @Query('stateId') stateId?: string,
    @Query('countryId') countryId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.warehouseService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        cityId,
        stateId,
        countryId,
      },
      user.userId,
    );
  }

  @Get(':id')
  @UseGuards(TenantPermissionGuard)
  @RequirePermissions('VIEW_WAREHOUSE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.warehouseService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @UseGuards(TenantPermissionGuard)
  @RequirePermissions('UPDATE_WAREHOUSE')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.warehouseService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
