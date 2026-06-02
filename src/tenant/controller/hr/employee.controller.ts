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
import { EmployeeService } from '../../service/hr/employee.service';
import { CreateEmployeeDto } from '../../dto/hr/employee/create-employee.dto';
import { UpdateEmployeeDto } from '../../dto/hr/employee/update-employee.dto';

@Controller('tenant/hr/employees')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Post('create')
  @RequirePermissions('CREATE_EMPLOYEE')
  create(
    @TenantConnection() tenantDb: DataSource,
    @Body() dto: CreateEmployeeDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeService.create(
      tenantDb,
      user.businessId,
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermissions('LIST_EMPLOYEE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
    @Query('designationId') designationId?: string,
    @Query('employeeStatus') employeeStatus?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        departmentId,
        designationId,
        employeeStatus,
      },
      user.userId,
    );
  }

  @Get(':id')
  @RequirePermissions('VIEW_EMPLOYEE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }

  @Put('update/:id')
  @RequirePermissions('UPDATE_EMPLOYEE')
  edit(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.employeeService.edit(
      tenantDb,
      user.businessId,
      id,
      dto,
      user.userId,
    );
  }
}
