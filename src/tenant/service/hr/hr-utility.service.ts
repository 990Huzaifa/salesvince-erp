import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  Department,
  Designation,
  Employee,
  PayPolicy,
  SalaryComponent,
} from 'src/tenant-db/entities/hr';
import {
  ComponentTypeEnum,
  EmployeeStatusEnum,
  EmploymentTypeEnum,
  GenderEnum,
  MaritalStatusEnum,
  OvertimeRateTypeEnum,
  PayCycleEnum,
  PayrollTypeEnum,
  SalaryCalculationTypeEnum,
  SalaryPaymentMethodEnum,
  SalaryStructureStatusEnum,
  WorkingDaysTypeEnum,
  ComponentCalculationTypeEnum,
} from 'src/tenant-db/entities/hr/hr.enums';
import { assertBusinessId } from './hr-common.util';

@Injectable()
export class HrUtilityService {
  getEnums() {
    return {
      gender: Object.values(GenderEnum),
      maritalStatus: Object.values(MaritalStatusEnum),
      employmentType: Object.values(EmploymentTypeEnum),
      employeeStatus: Object.values(EmployeeStatusEnum),
      salaryPaymentMethod: Object.values(SalaryPaymentMethodEnum),
      payrollType: Object.values(PayrollTypeEnum),
      payCycle: Object.values(PayCycleEnum),
      salaryCalculationType: Object.values(SalaryCalculationTypeEnum),
      workingDaysType: Object.values(WorkingDaysTypeEnum),
      overtimeRateType: Object.values(OvertimeRateTypeEnum),
      componentType: Object.values(ComponentTypeEnum),
      componentCalculationType: Object.values(ComponentCalculationTypeEnum),
      salaryStructureStatus: Object.values(SalaryStructureStatusEnum),
    };
  }

  async getDepartments(tenantDb: DataSource, businessId?: string) {
    const scopedBusinessId = assertBusinessId(businessId);
    const rows = await tenantDb.getRepository(Department).find({
      where: { businessId: scopedBusinessId, isActive: true, deletedAt: IsNull() },
      select: ['id', 'name', 'code', 'branchId'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getDesignations(
    tenantDb: DataSource,
    businessId?: string,
    departmentId?: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const where: {
      businessId: string;
      isActive: boolean;
      deletedAt: ReturnType<typeof IsNull>;
      departmentId?: string;
    } = {
      businessId: scopedBusinessId,
      isActive: true,
      deletedAt: IsNull(),
    };
    if (departmentId) {
      where.departmentId = departmentId;
    }

    const rows = await tenantDb.getRepository(Designation).find({
      where,
      select: ['id', 'name', 'code', 'departmentId', 'level'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getEmployees(tenantDb: DataSource, businessId?: string) {
    const scopedBusinessId = assertBusinessId(businessId);
    const rows = await tenantDb.getRepository(Employee).find({
      where: {
        businessId: scopedBusinessId,
        employeeStatus: EmployeeStatusEnum.ACTIVE,
        deletedAt: IsNull(),
      },
      select: ['id', 'fullName', 'employeeCode', 'departmentId', 'designationId'],
      order: { fullName: 'ASC' },
    });
    return { result: rows };
  }

  async getPayPolicies(tenantDb: DataSource, businessId?: string) {
    const scopedBusinessId = assertBusinessId(businessId);
    const rows = await tenantDb.getRepository(PayPolicy).find({
      where: { businessId: scopedBusinessId, isActive: true, deletedAt: IsNull() },
      select: ['id', 'name', 'code', 'isDefault', 'currency'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }

  async getSalaryComponents(
    tenantDb: DataSource,
    businessId?: string,
    componentType?: ComponentTypeEnum,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const where: {
      businessId: string;
      isActive: boolean;
      deletedAt: ReturnType<typeof IsNull>;
      componentType?: ComponentTypeEnum;
    } = {
      businessId: scopedBusinessId,
      isActive: true,
      deletedAt: IsNull(),
    };
    if (componentType) {
      where.componentType = componentType;
    }

    const rows = await tenantDb.getRepository(SalaryComponent).find({
      where,
      select: ['id', 'name', 'code', 'componentType', 'calculationType'],
      order: { name: 'ASC' },
    });
    return { result: rows };
  }
}
