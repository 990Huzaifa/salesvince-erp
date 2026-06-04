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
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import { SalaryVoucherService } from '../../service/vouchers/salary-voucher.service';
import {
  CreateSalaryVouchersDto,
  UpdateSalaryVoucherDto,
} from '../../dto/voucher/salary-voucher.dto';

@Controller('tenant/salary-vouchers')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SalaryVoucherController {
  constructor(private readonly salaryVoucherService: SalaryVoucherService) {}

  @Post('create')
  @RequirePermissions('CREATE_SALARY_VOUCHER')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSalaryVouchersDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryVoucherService.create(
      tenantDb,
      user.businessId!,
      dto.vouchers,
      user.userId,
    );
  }

  @Post('create-and-approve')
  @RequirePermissions('APPROVE_SALARY_VOUCHER')
  createAndApprove(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSalaryVouchersDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryVoucherService.createAndApprove(
      tenantDb,
      user.businessId!,
      dto.vouchers,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALARY_VOUCHER')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: VoucherStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryVoucherService.list(
      tenantDb,
      user.businessId!,
      { page: Number(page), limit: Number(limit), search, status },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALARY_VOUCHER')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryVoucherService.getById(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALARY_VOUCHER')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryVoucherDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryVoucherService.edit(
      tenantDb,
      user.businessId!,
      id,
      dto,
      user.userId,
    );
  }

  @Post('approve/:id')
  @RequirePermissions('APPROVE_SALARY_VOUCHER')
  approve(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryVoucherService.approve(
      tenantDb,
      user.businessId!,
      id,
      user.userId,
    );
  }
}
