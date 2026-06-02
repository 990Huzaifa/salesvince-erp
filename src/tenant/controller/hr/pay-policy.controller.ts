import {
  Body,
  Controller,
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
import { PayPolicyService } from '../../service/hr/pay-policy.service';
import { CreatePayPolicyDto } from '../../dto/hr/pay-policy/create-pay-policy.dto';
import { UpdatePayPolicyDto } from '../../dto/hr/pay-policy/update-pay-policy.dto';

@Controller('tenant/hr/pay-policies')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PayPolicyController {
  constructor(private readonly payPolicyService: PayPolicyService) {}

  @Post('create')
  @RequirePermissions('CREATE_PAY_POLICY')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePayPolicyDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payPolicyService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PAY_POLICY')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payPolicyService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        isActive:
          isActive === undefined ? undefined : isActive === 'true',
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PAY_POLICY')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payPolicyService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_PAY_POLICY')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayPolicyDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payPolicyService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
