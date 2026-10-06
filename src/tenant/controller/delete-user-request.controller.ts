import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { DeleteUserRequestStatus } from 'src/tenant-db/entities/delete-user-request.entity';
import { DeleteUserRequestService } from '../service/delete-user-request.service';
import { RequestAccountDeletionDto } from '../dto/user/request-account-deletion.dto';

@Controller('tenant')
export class DeleteUserRequestController {
  constructor(
    private readonly deleteUserRequestService: DeleteUserRequestService,
  ) {}

  /** Authenticated user requests their own account deletion. */
  @Post('profile/request-deletion')
  @UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard)
  requestDeletion(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: RequestAccountDeletionDto,
    @Req() req: Request,
  ) {
    return this.deleteUserRequestService.requestDeletion(
      tenantDb,
      req.user as TenantRequestUser,
      dto,
    );
  }

  /** Admin list — tenant access/login token (not business token). */
  @Get('delete-user-requests')
  @UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantLoginOnlyGuard,
    TenantSuperAdminGuard,
    TenantPermissionGuard,
  )
  @RequirePermissions('LIST_DELETE_USER_REQUEST')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: DeleteUserRequestStatus,
  ) {
    return this.deleteUserRequestService.listRequests(
      tenantDb,
      { page, limit, status },
      req.user as TenantRequestUser,
    );
  }

  /** Remove a delete-user request (does not delete the user). */
  @Delete('delete-user-requests/:id')
  @UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantLoginOnlyGuard,
    TenantSuperAdminGuard,
    TenantPermissionGuard,
  )
  @RequirePermissions('LIST_DELETE_USER_REQUEST')
  deleteRequest(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.deleteUserRequestService.deleteRequest(
      tenantDb,
      id,
      req.user as TenantRequestUser,
    );
  }

  /** Soft-delete account — tenant access/login token (not business token). */
  @Delete('users/:id/account')
  @UseGuards(
    TenantJwtAuthGuard,
    TenantJwtGuard,
    TenantConnectionGuard,
    TenantLoginOnlyGuard,
    TenantSuperAdminGuard,
    TenantPermissionGuard,
  )
  @RequirePermissions('DELETE_USER')
  deleteAccount(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.deleteUserRequestService.deleteAccount(
      tenantDb,
      id,
      req.user as TenantRequestUser,
    );
  }
}
