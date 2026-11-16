import {
  Body,
  Controller,
  Get,
  Param,
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
import { ServiceMasterService } from '../service/service-master.service';
import { CreateServiceDto } from '../dto/service/create-service.dto';
import { UpdateServiceDto } from '../dto/service/update-service.dto';

@Controller('tenant/services')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ServiceController {
  constructor(private readonly serviceMasterService: ServiceMasterService) {}

  @Post('create')
  @RequirePermissions('CREATE_SERVICE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateServiceDto,
    @Req() req: Request,
  ) {
    return this.serviceMasterService.create(tenantDb, dto, req.user);
  }

  @Get()
  @RequirePermissions('LIST_SERVICE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Req() req: Request,
  ) {
    return this.serviceMasterService.list(
      tenantDb,
      page,
      limit,
      search,
      req.user,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SERVICE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.serviceMasterService.view(tenantDb, id, req.user);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SERVICE')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @Req() req: Request,
  ) {
    return this.serviceMasterService.edit(tenantDb, id, dto, req.user);
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_SERVICE')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id') id: string,
    @Query('status') status: string,
    @Req() req: Request,
  ) {
    return this.serviceMasterService.updateStatus(
      tenantDb,
      id,
      status,
      req.user,
    );
  }
}
