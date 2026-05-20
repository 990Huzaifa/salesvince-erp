import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantLoginOnlyGuard } from 'src/auth/tenant-login-only.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantSuperAdminGuard } from 'src/auth/tenant-super-admin.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { TenantRoleService } from '../service/tenant-role.service';
import { CreateTenantRoleDto } from '../dto/role/create-tenant-role.dto';
import { UpdateTenantRoleDto } from '../dto/role/update-tenant-role.dto';

@Controller('tenant/roles')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantLoginOnlyGuard,
  TenantSuperAdminGuard,
  TenantPermissionGuard,
)
export class TenantRoleController {
  constructor(private readonly tenantRoleService: TenantRoleService) {}

  @Get('permissions')
  @RequirePermissions('LIST_ROLE')
  listPermissions(@TenantConnection() tenantDb: DataSource) {
    return this.tenantRoleService.listPermissions(tenantDb);
  }

  @Get()
  @RequirePermissions('LIST_ROLE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantRoleService.listRoles(
      tenantDb,
      Number(page),
      Number(limit),
      search,
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_ROLE')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantRoleService.getRoleById(tenantDb, id, user.userId);
  }

  @Post()
  @RequirePermissions('CREATE_ROLE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateTenantRoleDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantRoleService.createRole(tenantDb, dto, user.userId);
  }

  @Patch(':id')
  @RequirePermissions('UPDATE_ROLE')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantRoleDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantRoleService.updateRole(tenantDb, id, dto, user.userId);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_ROLE')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantRoleService.deleteRole(tenantDb, id, user.userId);
  }
}
