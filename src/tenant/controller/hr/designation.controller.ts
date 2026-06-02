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
import { DesignationService } from '../../service/hr/designation.service';
import { CreateDesignationDto } from '../../dto/hr/designation/create-designation.dto';
import { UpdateDesignationDto } from '../../dto/hr/designation/update-designation.dto';

@Controller('tenant/hr/designations')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class DesignationController {
  constructor(private readonly designationService: DesignationService) {}

  @Post('create')
  @RequirePermissions('CREATE_DESIGNATION')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateDesignationDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.designationService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_DESIGNATION')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.designationService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_DESIGNATION')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.designationService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_DESIGNATION')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDesignationDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.designationService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
