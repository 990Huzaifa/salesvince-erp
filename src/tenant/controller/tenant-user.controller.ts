import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import { DataSource } from 'typeorm';
import { CreateTenantUserDto } from '../dto/user/create-tenant-user.dto';
import { InviteTenantUserDto } from '../dto/user/invite-tenant-user.dto';
import { UserService } from '../service/user.service';

@Controller('tenant/users')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class TenantUserController {
  constructor(private readonly userService: UserService) { }

  private buildSetupBaseUrl(req: Request, tenantCode?: string): string {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : (forwardedProto || req.protocol || 'https');

    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : (forwardedHost || req.headers.host || '');

    const [hostOnly, port] = String(hostHeader).split(':');
    const parts = hostOnly.split('.').filter(Boolean);

    if (parts.length < 2) {
      return `${protocol}://${hostHeader}`;
    }

    const first = parts[0]?.toLowerCase();
    const rootDomain = parts.slice(1).join('.');
    const subdomain =
      !first || first === 'api' || first === 'www'
        ? tenantCode
        : parts[0];

    const finalHost = subdomain
      ? `${subdomain}.${rootDomain}${port ? `:${port}` : ''}`
      : hostHeader;

    return `${protocol}://${finalHost}`;
  }

  @Get('')
  @RequirePermissions('LIST_USER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Query('sort') sort: string = 'createdAt',
    @Query('sortDirection') sortDirection: string = 'DESC',
    @Query('roleId') roleId: string = null,
    @Req() req: Request,
  ) {
    return this.userService.listUsers(
      tenantDb,
      page,
      limit,
      search,
      sort,
      sortDirection,
      roleId,
      null,
      req.user as { userId: string, businessId: string },
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_USER')
  getById(@TenantConnection() tenantDb: DataSource, @Param('id') id: string, @Req() req: Request) {
    return this.userService.getUserById(tenantDb, id, req.user as { userId: string, businessId: string });
  }

  @Post('')
  @RequirePermissions('CREATE_USER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Body() dto: CreateTenantUserDto,
    @Req() req: Request,
  ) {
    return this.userService.createUser(tenantDb, tenantCode, dto, req.user as { userId: string, businessId: string });
  }

  @Patch(':id/avatar')
  @RequirePermissions('UPDATE_USER')
  updateAvatar(
    @TenantConnection() tenantDb: DataSource,
    @TenantCode() tenantCode: string,
    @Param('id') id: string,
    @Body('avatar') avatar: string | null,
    @Req() req: Request,
  ) {
    return this.userService.updateUserAvatar(
      tenantDb,
      tenantCode,
      id,
      avatar,
      req.user as { userId: string, businessId: string },
    );
  }

  @Put('update/:id/status')
  @RequirePermissions('UPDATE_USER')
  updateStatus(@TenantConnection() tenantDb: DataSource, @Param('id') id: string, @Query('status') status: boolean, @Req() req: Request) {
    return this.userService.updateUserStatus(tenantDb, id, status, req.user as { userId: string, businessId: string });
  }

  

  @Post('invite')
  invite(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: InviteTenantUserDto,
    @Req() req: Request,
  ) {
    const authUser = req.user as {
      tenantCode?: string;
      tenantName?: string;
    };

    return this.userService.inviteUser(
      tenantDb,
      dto,
      authUser?.tenantCode,
      authUser?.tenantName,
      this.buildSetupBaseUrl(req, authUser?.tenantCode),
      req.user as { userId: string, businessId: string },
    );
  }
}
