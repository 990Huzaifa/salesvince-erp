import {
  Body,
  Controller,
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
import { ChartOfAccountType } from 'src/tenant-db/chart-of-accounts/constants/chart-of-account-type.enum';
import { ChartOfAccountService } from '../service/chart-of-account.service';
import { CreateChartOfAccountDto } from '../dto/chart-of-account/create-chart-of-account.dto';
import { RenameChartOfAccountDto } from '../dto/chart-of-account/rename-chart-of-account.dto';

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

  @Get('types')
  @RequirePermissions('LIST_CHART_OF_ACCOUNT')
  listTypes() {
    return this.chartOfAccountService.listAccountTypes();
  }

  @Get()
  @RequirePermissions('LIST_CHART_OF_ACCOUNT')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('search') search?: string,
    @Query('type') type?: ChartOfAccountType,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.listAccounts(
      tenantDb,
      user.businessId,
      { search, type },
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

  @Patch(':id/rename')
  @RequirePermissions('UPDATE_CHART_OF_ACCOUNT')
  rename(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameChartOfAccountDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.chartOfAccountService.renameAccount(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
