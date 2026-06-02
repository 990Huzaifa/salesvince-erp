import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { HrUtilityService } from '../../service/hr/hr-utility.service';
import { ComponentTypeEnum } from 'src/tenant-db/entities/hr/hr.enums';

@Controller('tenant/hr/lists')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
)
export class HrListsController {
  constructor(private readonly hrUtilityService: HrUtilityService) {}

  @Get('enums')
  getEnums() {
    return { data: this.hrUtilityService.getEnums() };
  }

  @Get('departments')
  getDepartments(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.hrUtilityService.getDepartments(tenantDb, user.businessId);
  }

  @Get('designations')
  getDesignations(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('departmentId') departmentId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.hrUtilityService.getDesignations(
      tenantDb,
      user.businessId,
      departmentId,
    );
  }

  @Get('employees')
  getEmployees(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.hrUtilityService.getEmployees(tenantDb, user.businessId);
  }

  @Get('pay-policies')
  getPayPolicies(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.hrUtilityService.getPayPolicies(tenantDb, user.businessId);
  }

  @Get('salary-components')
  getSalaryComponents(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('componentType') componentType?: ComponentTypeEnum,
  ) {
    const user = req.user as TenantRequestUser;
    return this.hrUtilityService.getSalaryComponents(
      tenantDb,
      user.businessId,
      componentType,
    );
  }
}
