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
import { CreateClaimVendorReceiptDto } from '../../dto/claim/create-claim-vendor-receipt.dto';
import { ClaimVendorReceiptService } from '../../service/claim/claim-vendor-receipt.service';

@Controller('tenant/claim-vendor-receipts')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimVendorReceiptController {
  constructor(
    private readonly claimVendorReceiptService: ClaimVendorReceiptService,
  ) {}

  @Post('create-and-post')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  createAndPost(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimVendorReceiptDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorReceiptService.createAndPost(
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
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimVendorReceiptService.list(tenantDb, user.businessId, {
      page,
      limit,
      claimId,
      vendorId,
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
    return this.claimVendorReceiptService.view(tenantDb, user.businessId, id);
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
    return this.claimVendorReceiptService.cancel(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
