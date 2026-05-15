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
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { PartyType } from 'src/tenant-db/entities/party.entity';
import { PartyService } from '../service/party.service';
import { CreatePartyDto } from '../dto/party/create-party.dto';
import { UpdatePartyDto } from '../dto/party/update-party.dto';

@Controller('tenant/parties')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PartyController {
  constructor(private readonly partyService: PartyService) {}

  @Get()
  @RequirePermissions('LIST_PARTY')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('type') type?: PartyType,
  ) {
    const user = req.user as TenantRequestUser;
    return this.partyService.listParties(
      tenantDb,
      user.businessId,
      { page: Number(page), limit: Number(limit), search, type },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PARTY')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.partyService.getPartyById(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post()
  @RequirePermissions('CREATE_PARTY')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePartyDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.partyService.createParty(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Patch(':id')
  @RequirePermissions('UPDATE_PARTY')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartyDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.partyService.updateParty(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PARTY')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.partyService.deleteParty(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
