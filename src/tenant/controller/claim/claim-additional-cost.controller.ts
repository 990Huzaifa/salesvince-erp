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
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { CreateClaimAdditionalCostDto } from '../../dto/claim/create-claim-additional-cost.dto';
import { ClaimAdditionalCostService } from '../../service/claim/claim-additional-cost.service';

@Controller('tenant/claim-additional-costs')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimAdditionalCostController {
  constructor(
    private readonly claimAdditionalCostService: ClaimAdditionalCostService,
  ) {}

  @Post('create')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimAdditionalCostDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimAdditionalCostService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_CLAIM')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('claimId') claimId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimAdditionalCostService.list(tenantDb, user.businessId, {
      page,
      limit,
      claimId,
    });
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLAIM')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimAdditionalCostService.view(tenantDb, user.businessId, id);
  }

  @Delete('delete/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimAdditionalCostService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
