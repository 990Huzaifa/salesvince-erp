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
import { PayrollRunService } from '../../service/hr/payroll-run.service';
import { PayslipService } from '../../service/hr/payslip.service';
import { CreatePayrollRunDto } from '../../dto/hr/payroll-run/create-payroll-run.dto';

@Controller('tenant/hr/payroll-runs')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class PayrollRunController {
  constructor(
    private readonly payrollRunService: PayrollRunService,
    private readonly payslipService: PayslipService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_PAYROLL_RUN')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreatePayrollRunDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payrollRunService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Post(':id/generate')
  @RequirePermissions('GENERATE_PAYROLL_RUN')
  generate(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payrollRunService.generate(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post(':id/approve-all')
  @RequirePermissions('APPROVE_PAYSLIP')
  approveAll(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payslipService.approveAllForRun(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_PAYROLL_RUN')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payrollRunService.list(
      tenantDb,
      user.businessId,
      { page: Number(page), limit: Number(limit) },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_PAYROLL_RUN')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.payrollRunService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
