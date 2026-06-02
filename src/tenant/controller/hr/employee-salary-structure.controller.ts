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
import { EmployeeSalaryStructureService } from '../../service/hr/employee-salary-structure.service';
import { CreateEmployeeSalaryStructureDto } from '../../dto/hr/employee-salary-structure/create-employee-salary-structure.dto';
import { UpdateEmployeeSalaryStructureDto } from '../../dto/hr/employee-salary-structure/update-employee-salary-structure.dto';

@Controller('tenant/hr/employee-salary-structures')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class EmployeeSalaryStructureController {
  constructor(
    private readonly employeeSalaryStructureService: EmployeeSalaryStructureService,
  ) {}

  @Post('create')
  @RequirePermissions('CREATE_EMPLOYEE_SALARY_STRUCTURE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateEmployeeSalaryStructureDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeSalaryStructureService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_EMPLOYEE_SALARY_STRUCTURE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeSalaryStructureService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        employeeId,
        status,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_EMPLOYEE_SALARY_STRUCTURE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeSalaryStructureService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_EMPLOYEE_SALARY_STRUCTURE')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeSalaryStructureDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeSalaryStructureService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
