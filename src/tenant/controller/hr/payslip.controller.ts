import {
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
import { PayslipService } from '../../service/hr/payslip.service';

@Controller('tenant/hr/payslips')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PayslipController {
  constructor(private readonly payslipService: PayslipService) {}

  @Get()
  @RequirePermissions('LIST_PAYSLIP')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('payrollRunId') payrollRunId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payslipService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        payrollRunId,
        employeeId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PAYSLIP')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payslipService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post(':id/approve')
  @RequirePermissions('APPROVE_PAYSLIP')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payslipService.approve(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('CANCEL_PAYSLIP')
  cancel(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payslipService.cancel(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
