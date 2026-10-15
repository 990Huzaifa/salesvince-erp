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
import {
  ClaimSourceType,
  ClaimStatus,
} from 'src/tenant-db/entities/claim/claim.entity';
import { CreateClaimDto } from '../../dto/claim/create-claim.dto';
import { DiscardClaimDto } from '../../dto/claim/discard-claim.dto';
import { ReceiveFromVendorDto } from '../../dto/claim/receive-from-vendor.dto';
import { SendToVendorDto } from '../../dto/claim/send-to-vendor.dto';
import { UpdateClaimDto } from '../../dto/claim/update-claim.dto';
import { ValidateClaimDto } from '../../dto/claim/validate-claim.dto';
import { ClaimService } from '../../service/claim/claim.service';

@Controller('tenant/claims')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimController {
  constructor(private readonly claimService: ClaimService) {}

  @Post('create')
  @RequirePermissions('CREATE_CLAIM')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateClaimDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.create(
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
    @Query('search') search?: string,
    @Query('status') status?: ClaimStatus,
    @Query('sourceType') sourceType?: ClaimSourceType,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.list(
      tenantDb,
      user.businessId,
      { page, limit, search, status, sourceType },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLAIM')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.view(tenantDb, user.businessId, id, user.userId);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_CLAIM')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClaimDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.update(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete('delete/:id')
  @RequirePermissions('DELETE_CLAIM')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.delete(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('submit/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  submit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.submit(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('validate/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  validate(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateClaimDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.validate(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Post('send-to-vendor/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  sendToVendor(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendToVendorDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.sendToVendor(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Post('receive-from-vendor/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  receiveFromVendor(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveFromVendorDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.receiveFromVendor(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Post('discard/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  discard(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiscardClaimDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.discard(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Post('deliver-to-customer/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  deliverToCustomer(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.deliverToCustomer(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post('return-to-location/:id')
  @RequirePermissions('UPDATE_CLAIM_STATUS')
  returnToLocation(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimService.returnToLocation(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
