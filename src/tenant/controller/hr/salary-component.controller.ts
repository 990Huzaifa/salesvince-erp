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
import { SalaryComponentService } from '../../service/hr/salary-component.service';
import { CreateSalaryComponentDto } from '../../dto/hr/salary-component/create-salary-component.dto';
import { UpdateSalaryComponentDto } from '../../dto/hr/salary-component/update-salary-component.dto';

@Controller('tenant/hr/salary-components')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SalaryComponentController {
  constructor(
    private readonly salaryComponentService: SalaryComponentService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_SALARY_COMPONENT')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateSalaryComponentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryComponentService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_SALARY_COMPONENT')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('componentType') componentType?: string,
    @Query('isActive') isActive?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryComponentService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        componentType,
        isActive:
          isActive === undefined ? undefined : isActive === 'true',
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALARY_COMPONENT')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryComponentService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_SALARY_COMPONENT')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryComponentDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.salaryComponentService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
