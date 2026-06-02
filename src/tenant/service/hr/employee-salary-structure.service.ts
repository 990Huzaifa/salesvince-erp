import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  Employee,
  EmployeeSalaryComponent,
  EmployeeSalaryStructure,
  PayPolicy,
  SalaryComponent,
} from 'src/tenant-db/entities/hr';
import {
  ComponentTypeEnum,
  SalaryStructureStatusEnum,
} from 'src/tenant-db/entities/hr/hr.enums';
import { CreateEmployeeSalaryStructureDto } from '../../dto/hr/employee-salary-structure/create-employee-salary-structure.dto';
import { UpdateEmployeeSalaryStructureDto } from '../../dto/hr/employee-salary-structure/update-employee-salary-structure.dto';
import { EmployeeSalaryComponentItemDto } from '../../dto/hr/shared/employee-salary-component-item.dto';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  IsNull,
  parseDate,
  roundAmount,
} from './hr-common.util';

@Injectable()
export class EmployeeSalaryStructureService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapComponentLine(row: EmployeeSalaryComponent) {
    return {
      id: row.id,
      salaryComponentId: row.salaryComponentId,
      componentType: row.componentType,
      calculationType: row.calculationType,
      value: Number(row.value),
      calculatedAmount: Number(row.calculatedAmount),
      isActive: row.isActive,
      salaryComponent: row.salaryComponent
        ? {
            id: row.salaryComponent.id,
            name: row.salaryComponent.name,
            code: row.salaryComponent.code,
          }
        : null,
    };
  }

  private mapStructure(structure: EmployeeSalaryStructure, withComponents = false) {
    return {
      id: structure.id,
      businessId: structure.businessId,
      employeeId: structure.employeeId,
      payPolicyId: structure.payPolicyId,
      effectiveFrom: structure.effectiveFrom,
      effectiveTo: structure.effectiveTo,
      basicSalary: Number(structure.basicSalary),
      grossSalary: Number(structure.grossSalary),
      totalEarnings: Number(structure.totalEarnings),
      totalDeductions: Number(structure.totalDeductions),
      netSalary: Number(structure.netSalary),
      currency: structure.currency,
      status: structure.status,
      remarks: structure.remarks,
      employee: structure.employee
        ? {
            id: structure.employee.id,
            fullName: structure.employee.fullName,
            employeeCode: structure.employee.employeeCode,
          }
        : null,
      payPolicy: structure.payPolicy
        ? {
            id: structure.payPolicy.id,
            name: structure.payPolicy.name,
            code: structure.payPolicy.code,
          }
        : null,
      components:
        withComponents && structure.components
          ? structure.components.map((c) => this.mapComponentLine(c))
          : undefined,
      createdAt: structure.createdAt,
      updatedAt: structure.updatedAt,
    };
  }

  private computeTotals(components: EmployeeSalaryComponentItemDto[]) {
    let totalEarnings = 0;
    let totalDeductions = 0;
    let basicSalary = 0;

    for (const line of components) {
      const amount = roundAmount(line.calculatedAmount);
      if (line.componentType === ComponentTypeEnum.EARNING) {
        totalEarnings += amount;
      } else {
        totalDeductions += amount;
      }
    }

    const basicLine = components.find((c) => c.componentType === ComponentTypeEnum.EARNING);
    if (basicLine) {
      basicSalary = roundAmount(basicLine.calculatedAmount);
    }

    const grossSalary = roundAmount(totalEarnings);
    const netSalary = roundAmount(totalEarnings - totalDeductions);

    return {
      basicSalary,
      grossSalary,
      totalEarnings: grossSalary,
      totalDeductions: roundAmount(totalDeductions),
      netSalary,
    };
  }

  private async findForBusiness(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    withComponents = false,
  ): Promise<EmployeeSalaryStructure> {
    const row = await tenantDb.getRepository(EmployeeSalaryStructure).findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: withComponents
        ? {
            employee: true,
            payPolicy: true,
            components: { salaryComponent: true },
          }
        : { employee: true, payPolicy: true },
    });
    if (!row) {
      throw new NotFoundException('Employee salary structure not found');
    }
    if (row.components) {
      row.components.sort((a, b) =>
        (a.salaryComponent?.name ?? '').localeCompare(
          b.salaryComponent?.name ?? '',
        ),
      );
    }
    return row;
  }

  private async closeActiveStructures(
    tenantDb: DataSource,
    businessId: string,
    employeeId: string,
    effectiveFrom: Date,
  ): Promise<void> {
    const repo = tenantDb.getRepository(EmployeeSalaryStructure);
    const activeRows = await repo.find({
      where: {
        businessId,
        employeeId,
        status: SalaryStructureStatusEnum.ACTIVE,
        deletedAt: IsNull(),
      },
    });

    const closeDate = new Date(effectiveFrom);
    closeDate.setDate(closeDate.getDate() - 1);

    for (const row of activeRows) {
      row.status = SalaryStructureStatusEnum.REVISED;
      row.effectiveTo = closeDate;
      await repo.save(row);
    }
  }

  private async validateReferences(
    tenantDb: DataSource,
    businessId: string,
    employeeId: string,
    payPolicyId: string,
    components: EmployeeSalaryComponentItemDto[],
  ): Promise<void> {
    const employee = await tenantDb.getRepository(Employee).findOne({
      where: { id: employeeId, businessId, deletedAt: IsNull() },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const policy = await tenantDb.getRepository(PayPolicy).findOne({
      where: { id: payPolicyId, businessId, deletedAt: IsNull() },
    });
    if (!policy) {
      throw new NotFoundException('Pay policy not found');
    }

    if (!components.length) {
      throw new BadRequestException('At least one salary component line is required');
    }

    const ids = [...new Set(components.map((c) => c.salaryComponentId))];
    const found = await tenantDb.getRepository(SalaryComponent).find({
      where: { id: In(ids), businessId, deletedAt: IsNull() },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('One or more salary components are invalid');
    }
  }

  private async saveComponentLines(
    tenantDb: DataSource,
    businessId: string,
    structure: EmployeeSalaryStructure,
    components: EmployeeSalaryComponentItemDto[],
  ): Promise<void> {
    const repo = tenantDb.getRepository(EmployeeSalaryComponent);
    for (const line of components) {
      await repo.save(
        repo.create({
          businessId,
          employeeSalaryStructureId: structure.id,
          employeeId: structure.employeeId,
          salaryComponentId: line.salaryComponentId,
          componentType: line.componentType,
          calculationType: line.calculationType,
          value: line.value ?? line.calculatedAmount,
          calculatedAmount: line.calculatedAmount,
          isActive: line.isActive ?? true,
        }),
      );
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateEmployeeSalaryStructureDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    await this.validateReferences(
      tenantDb,
      scopedBusinessId,
      dto.employeeId,
      dto.payPolicyId,
      dto.components,
    );

    const effectiveFrom = parseDate(dto.effectiveFrom, 'effectiveFrom');
    const effectiveTo = dto.effectiveTo
      ? parseDate(dto.effectiveTo, 'effectiveTo')
      : null;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException(
        'effectiveTo must be on or after effectiveFrom',
      );
    }

    const status = dto.status ?? SalaryStructureStatusEnum.ACTIVE;
    if (status === SalaryStructureStatusEnum.ACTIVE) {
      await this.closeActiveStructures(
        tenantDb,
        scopedBusinessId,
        dto.employeeId,
        effectiveFrom,
      );
    }

    const totals = this.computeTotals(dto.components);
    const structure = await tenantDb.getRepository(EmployeeSalaryStructure).save(
      tenantDb.getRepository(EmployeeSalaryStructure).create({
        businessId: scopedBusinessId,
        employeeId: dto.employeeId,
        payPolicyId: dto.payPolicyId,
        effectiveFrom,
        effectiveTo,
        basicSalary: dto.basicSalary ?? totals.basicSalary,
        grossSalary: totals.grossSalary,
        totalEarnings: totals.totalEarnings,
        totalDeductions: totals.totalDeductions,
        netSalary: totals.netSalary,
        currency: dto.currency?.trim() || 'PKR',
        status,
        remarks: dto.remarks?.trim() ?? null,
      }),
    );

    await this.saveComponentLines(
      tenantDb,
      scopedBusinessId,
      structure,
      dto.components,
    );

    if (status === SalaryStructureStatusEnum.ACTIVE) {
      await tenantDb.getRepository(Employee).update(
        { id: dto.employeeId, businessId: scopedBusinessId },
        { payPolicyId: dto.payPolicyId },
      );
    }

    const full = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      structure.id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_SALARY_STRUCTURE_CREATED',
      description: `Salary structure created for employee ${full.employee?.fullName ?? dto.employeeId}`,
      metadata: {
        employeeSalaryStructureId: full.id,
        employeeId: dto.employeeId,
      },
    });

    return { data: this.mapStructure(full, true) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      employeeId?: string;
      status?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);

    const qb = tenantDb
      .getRepository(EmployeeSalaryStructure)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.employee', 'employee')
      .leftJoinAndSelect('s.payPolicy', 'payPolicy')
      .where('s.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('s.deletedAt IS NULL');

    if (options.employeeId) {
      qb.andWhere('s.employeeId = :employeeId', {
        employeeId: options.employeeId,
      });
    }
    if (options.status) {
      qb.andWhere('s.status = :status', { status: options.status });
    }

    const [rows, total] = await qb
      .orderBy('s.effectiveFrom', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_SALARY_STRUCTURE_LISTED',
      description: 'Employee salary structures listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapStructure(row)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const row = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_SALARY_STRUCTURE_VIEWED',
      description: 'Employee salary structure viewed',
      metadata: { employeeSalaryStructureId: row.id },
    });

    return { data: this.mapStructure(row, true) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: UpdateEmployeeSalaryStructureDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const row = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    if (dto.payPolicyId !== undefined) {
      const policy = await tenantDb.getRepository(PayPolicy).findOne({
        where: { id: dto.payPolicyId, businessId: scopedBusinessId, deletedAt: IsNull() },
      });
      if (!policy) {
        throw new NotFoundException('Pay policy not found');
      }
      row.payPolicyId = dto.payPolicyId;
    }

    if (dto.effectiveFrom !== undefined) {
      row.effectiveFrom = parseDate(dto.effectiveFrom, 'effectiveFrom');
    }
    if (dto.effectiveTo !== undefined) {
      row.effectiveTo = dto.effectiveTo
        ? parseDate(dto.effectiveTo, 'effectiveTo')
        : null;
    }
    if (row.effectiveTo && row.effectiveTo < row.effectiveFrom) {
      throw new BadRequestException(
        'effectiveTo must be on or after effectiveFrom',
      );
    }

    if (dto.status !== undefined) {
      if (
        dto.status === SalaryStructureStatusEnum.ACTIVE &&
        row.status !== SalaryStructureStatusEnum.ACTIVE
      ) {
        await this.closeActiveStructures(
          tenantDb,
          scopedBusinessId,
          row.employeeId,
          row.effectiveFrom,
        );
      }
      row.status = dto.status;
    }

    if (dto.remarks !== undefined) {
      row.remarks = dto.remarks?.trim() ?? null;
    }
    if (dto.currency !== undefined) {
      row.currency = dto.currency.trim();
    }

    if (dto.components !== undefined) {
      await this.validateReferences(
        tenantDb,
        scopedBusinessId,
        row.employeeId,
        row.payPolicyId,
        dto.components,
      );

      const existingLines = await tenantDb
        .getRepository(EmployeeSalaryComponent)
        .find({
          where: {
            employeeSalaryStructureId: row.id,
            businessId: scopedBusinessId,
            deletedAt: IsNull(),
          },
        });
      for (const line of existingLines) {
        await tenantDb.getRepository(EmployeeSalaryComponent).softRemove(line);
      }

      const totals = this.computeTotals(dto.components);
      row.basicSalary = dto.basicSalary ?? totals.basicSalary;
      row.grossSalary = totals.grossSalary;
      row.totalEarnings = totals.totalEarnings;
      row.totalDeductions = totals.totalDeductions;
      row.netSalary = totals.netSalary;

      await tenantDb.getRepository(EmployeeSalaryStructure).save(row);
      await this.saveComponentLines(
        tenantDb,
        scopedBusinessId,
        row,
        dto.components,
      );
    } else {
      if (dto.basicSalary !== undefined) {
        row.basicSalary = dto.basicSalary;
      }
      await tenantDb.getRepository(EmployeeSalaryStructure).save(row);
    }

    if (row.status === SalaryStructureStatusEnum.ACTIVE) {
      await tenantDb.getRepository(Employee).update(
        { id: row.employeeId, businessId: scopedBusinessId },
        { payPolicyId: row.payPolicyId },
      );
    }

    const full = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      row.id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'EMPLOYEE_SALARY_STRUCTURE_UPDATED',
      description: 'Employee salary structure updated',
      metadata: { employeeSalaryStructureId: full.id },
    });

    return { data: this.mapStructure(full, true) };
  }
}
