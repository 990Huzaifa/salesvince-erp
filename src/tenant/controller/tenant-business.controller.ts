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
import { TenantLoginOnlyGuard } from 'src/auth/tenant-login-only.guard';
import { TenantSuperAdminGuard } from 'src/auth/tenant-super-admin.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantCode, TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { TenantBusinessService } from '../service/tenant-business.service';
import { CreateTenantBusinessDto } from '../dto/business/create-tenant-business.dto';
import { AssignBusinessMemberDto } from '../dto/business/assign-business-member.dto';

@Controller('tenant/businesses')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantLoginOnlyGuard,
  TenantSuperAdminGuard,
)
export class TenantBusinessController {
  constructor(private readonly tenantBusinessService: TenantBusinessService) {}

  @Get()
  list(@TenantConnection() tenantDb: DataSource, @Req() req: Request, @Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    const user = req.user as TenantRequestUser;
    return this.tenantBusinessService.listBusinesses(tenantDb, user.userId, Number(page), Number(limit));
  }

  @Post()
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateTenantBusinessDto,
    @Req() req: Request,
    @TenantCode() tenantCode: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantBusinessService.createBusiness(tenantDb, dto, user.userId, tenantCode);
  }

  @Post(':businessId/members')
  assignMember(
    @TenantConnection() tenantDb: DataSource,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: AssignBusinessMemberDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.tenantBusinessService.assignMember(
      tenantDb,
      businessId,
      dto,
      user.userId,
    );
  }
}
