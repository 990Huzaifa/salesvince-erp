import {
  Body,
  Controller,
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
import { CancelClaimDocDto } from '../../dto/claim/cancel-claim-doc.dto';
import { CreateClaimDiscardDto } from '../../dto/claim/create-claim-discard.dto';
import { ClaimDiscardService } from '../../service/claim/claim-discard.service';

@Controller('tenant/claim-discards')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimDiscardController {
  constructor(private readonly claimDiscardService: ClaimDiscardService) {}

  @Post('create-and-post')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  createAndPost(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimDiscardDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimDiscardService.createAndPost(
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
    return this.claimDiscardService.list(tenantDb, user.businessId, {
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
    return this.claimDiscardService.view(tenantDb, user.businessId, id);
  }

  @Post('cancel/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  cancel(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelClaimDocDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimDiscardService.cancel(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
