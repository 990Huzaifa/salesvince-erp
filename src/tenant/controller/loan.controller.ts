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
import { LoanStatus } from 'src/tenant-db/entities/loan.entity';
import { LoanService } from '../service/loan.service';
import { CreateLoanDto } from '../dto/loan/create-loan.dto';
import { UpdateLoanDto } from '../dto/loan/update-loan.dto';
import { UpdateLoanStatusDto } from '../dto/loan/update-loan-status.dto';

@Controller('tenant/loans')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Get()
  @RequirePermissions('LIST_LOAN')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('status') status?: LoanStatus,
  ) {
    const user = req.user as TenantRequestUser;
    return this.loanService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_LOAN')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.loanService.view(tenantDb, user.businessId, id, user.userId);
  }

  @Post('create')
  @RequirePermissions('CREATE_LOAN')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateLoanDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.loanService.create(tenantDb, user.businessId, dto, user.userId);
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_LOAN')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.loanService.edit(tenantDb, user.businessId, id, dto, user.userId);
  }

  @Post('status-change/:id')
  @RequirePermissions('APPROVE_LOAN')
  updateStatus(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLoanStatusDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.loanService.updateStatus(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
