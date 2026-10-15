import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { CreateClaimCostTypeDto } from '../../dto/claim/create-claim-cost-type.dto';
import { CreateClaimDiscardReasonDto } from '../../dto/claim/create-claim-discard-reason.dto';
import { UpdateClaimSettingsDto } from '../../dto/claim/update-claim-settings.dto';
import { ClaimMasterService } from '../../service/claim/claim-master.service';

@Controller('tenant/claim-masters')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimMasterController {
  constructor(private readonly claimMasterService: ClaimMasterService) {}

  @Get('discard-reasons')
  @RequirePermissions('LIST_CLAIM')
  listDiscardReasons(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.listDiscardReasons(
      tenantDb,
      user.businessId,
    );
  }

  @Post('discard-reasons')
  @RequirePermissions('UPDATE_CLAIM')
  createDiscardReason(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimDiscardReasonDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.createDiscardReason(
      tenantDb,
      user.businessId,
      dto,
    );
  }

  @Put('discard-reasons/:id')
  @RequirePermissions('UPDATE_CLAIM')
  updateDiscardReason(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClaimDiscardReasonDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.updateDiscardReason(
      tenantDb,
      user.businessId,
      id,
      dto,
    );
  }

  @Delete('discard-reasons/:id')
  @RequirePermissions('UPDATE_CLAIM')
  deleteDiscardReason(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.deleteDiscardReason(
      tenantDb,
      user.businessId,
      id,
    );
  }

  @Get('cost-types')
  @RequirePermissions('LIST_CLAIM')
  listCostTypes(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.listCostTypes(tenantDb, user.businessId);
  }

  @Post('cost-types')
  @RequirePermissions('UPDATE_CLAIM')
  createCostType(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimCostTypeDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.createCostType(
      tenantDb,
      user.businessId,
      dto,
    );
  }

  @Put('cost-types/:id')
  @RequirePermissions('UPDATE_CLAIM')
  updateCostType(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateClaimCostTypeDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.updateCostType(
      tenantDb,
      user.businessId,
      id,
      dto,
    );
  }

  @Delete('cost-types/:id')
  @RequirePermissions('UPDATE_CLAIM')
  deleteCostType(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.deleteCostType(
      tenantDb,
      user.businessId,
      id,
    );
  }

  @Get('settings')
  @RequirePermissions('LIST_CLAIM')
  getSettings(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.getSettings(tenantDb, user.businessId);
  }

  @Put('settings')
  @RequirePermissions('UPDATE_CLAIM')
  updateSettings(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: UpdateClaimSettingsDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimMasterService.updateSettings(
      tenantDb,
      user.businessId,
      dto,
    );
  }
}
