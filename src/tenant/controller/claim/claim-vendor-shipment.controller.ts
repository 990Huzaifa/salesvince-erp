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
import { ClaimVendorShipmentStatus } from 'src/tenant-db/entities/claim/claim-vendor-shipments.entity';
import { CreateClaimVendorShipmentDto } from '../../dto/claim/create-claim-vendor-shipment.dto';
import { UpdateClaimVendorShipmentDto } from '../../dto/claim/update-claim-vendor-shipment.dto';
import { ClaimVendorShipmentService } from '../../service/claim/claim-vendor-shipment.service';

@Controller('tenant/claim-vendor-shipments')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimVendorShipmentController {
  constructor(
    private readonly claimVendorShipmentService: ClaimVendorShipmentService,
  ) {}

  @Post('create')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimVendorShipmentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  /** Create as SHIPPED + mark claim SENT_TO_VENDOR in one step. */
  @Post('create-and-ship')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  createAndShip(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimVendorShipmentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.createAndShip(
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
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: ClaimVendorShipmentStatus,
    @Query('search') search?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.list(tenantDb, user.businessId, {
      page,
      limit,
      claimId,
      vendorId,
      status,
      search,
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
    return this.claimVendorShipmentService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClaimVendorShipmentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.update(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Post('ship/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  ship(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.ship(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('cancel/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  cancel(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.cancel(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Delete('delete/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorShipmentService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
