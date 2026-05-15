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
import { ChartOfAccountKind } from 'src/tenant-db/entities/chart-of-account.entity';
import { ChartOfAccountService } from '../service/chart-of-account.service';
import { CreateChartOfAccountDto } from '../dto/chart-of-account/create-chart-of-account.dto';
import { UpdateChartOfAccountDto } from '../dto/chart-of-account/update-chart-of-account.dto';

@Controller('tenant/chart-of-accounts')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ChartOfAccountController {
  constructor(private readonly chartOfAccountService: ChartOfAccountService) {}

  @Get()
  @RequirePermissions('LIST_CHART_OF_ACCOUNT')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('parentCode') parentCode?: string,
    @Query('postableOnly') postableOnly?: string,
    @Query('tree') tree?: string,
    @Query('partyId') partyId?: string,
    @Query('accountKind') accountKind?: ChartOfAccountKind,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.listAccounts(
      tenantDb,
      user.businessId,
      {
        search,
        parentCode,
        postableOnly: postableOnly === 'true',
        asTree: tree === 'true',
        partyId,
        accountKind,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_CHART_OF_ACCOUNT')
  getById(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.getAccountById(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Post()
  @RequirePermissions('CREATE_CHART_OF_ACCOUNT')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateChartOfAccountDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.createAccount(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Patch(':id')
  @RequirePermissions('UPDATE_CHART_OF_ACCOUNT')
  update(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChartOfAccountDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.updateAccount(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_CHART_OF_ACCOUNT')
  delete(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.deleteAccount(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
