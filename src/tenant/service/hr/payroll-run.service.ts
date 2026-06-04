import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  Employee,
  EmployeeSalaryStructure,
  PayPolicy,
  PayrollRun,
  Payslip,
  PayslipLine,
} from 'src/tenant-db/entities/hr';
import {
  EmployeeStatusEnum,
  PayrollRunStatusEnum,
  PayslipStatusEnum,
  SalaryStructureStatusEnum,
} from 'src/tenant-db/entities/hr/hr.enums';
import { CreatePayrollRunDto } from '../../dto/hr/payroll-run/create-payroll-run.dto';
import { ActivityLogService } from '../activity-log.service';
import { assertBusinessId, computeSalaryTotals } from './hr-common.util';

function getPeriodBounds(periodYear: number, periodMonth: number) {
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);
  return { periodStart, periodEnd };
}

@Injectable()
export class PayrollRunService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapRun(run: PayrollRun, payslipCount?: number) {
    return {
      id: run.id,
      businessId: run.businessId,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      payPolicyId: run.payPolicyId,
      status: run.status,
      generatedAt: run.generatedAt,
      payslipCount,
      payPolicy: run.payPolicy
        ? { id: run.payPolicy.id, name: run.payPolicy.name, code: run.payPolicy.code }
        : null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private async findForBusiness(
    tenantDb: DataSource,
    businessId: string,
    id: string,
  ): Promise<PayrollRun> {
    const row = await tenantDb.getRepository(PayrollRun).findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: { payPolicy: true },
    });
    if (!row) {
      throw new NotFoundException('Payroll run not found');
    }
    return row;
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePayrollRunDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);

    if (dto.payPolicyId) {
      const policy = await tenantDb.getRepository(PayPolicy).findOne({
        where: { id: dto.payPolicyId, businessId: scopedBusinessId, deletedAt: IsNull() },
      });
      if (!policy) {
        throw new NotFoundException('Pay policy not found');
      }
    }

    const existing = await tenantDb.getRepository(PayrollRun).findOne({
      where: {
        businessId: scopedBusinessId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        deletedAt: IsNull(),
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Payroll run already exists for this period',
      );
    }

    const created = await tenantDb.getRepository(PayrollRun).save(
      tenantDb.getRepository(PayrollRun).create({
        businessId: scopedBusinessId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        payPolicyId: dto.payPolicyId ?? null,
        status: PayrollRunStatusEnum.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYROLL_RUN_CREATED',
      description: `Payroll run ${dto.periodYear}-${dto.periodMonth} created`,
      metadata: { payrollRunId: created.id },
    });

    return { data: this.mapRun(created) };
  }

  async generate(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const run = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    if (run.status === PayrollRunStatusEnum.CLOSED) {
      throw new BadRequestException('Closed payroll run cannot be regenerated');
    }

    const { periodStart, periodEnd } = getPeriodBounds(
      run.periodYear,
      run.periodMonth,
    );

    const employeeQb = tenantDb
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('e.deletedAt IS NULL')
      .andWhere('e.employeeStatus = :status', {
        status: EmployeeStatusEnum.ACTIVE,
      });

    if (run.payPolicyId) {
      employeeQb.andWhere('e.payPolicyId = :payPolicyId', {
        payPolicyId: run.payPolicyId,
      });
    }

    const employees = await employeeQb.getMany();
    const warnings: string[] = [];
    let generatedCount = 0;

    await tenantDb.transaction(async (manager) => {
      const payslipRepo = manager.getRepository(Payslip);
      const lineRepo = manager.getRepository(PayslipLine);
      const structureRepo = manager.getRepository(EmployeeSalaryStructure);

      const existingDrafts = await payslipRepo.find({
        where: {
          payrollRunId: run.id,
          status: PayslipStatusEnum.DRAFT,
          deletedAt: IsNull(),
        },
      });
      for (const draft of existingDrafts) {
        await lineRepo.delete({ payslipId: draft.id });
        await payslipRepo.delete(draft.id);
      }

      for (const employee of employees) {
        const structure = await structureRepo
          .createQueryBuilder('s')
          .leftJoinAndSelect('s.components', 'c', 'c.deletedAt IS NULL')
          .leftJoinAndSelect('c.salaryComponent', 'sc')
          .where('s.businessId = :businessId', { businessId: scopedBusinessId })
          .andWhere('s.employeeId = :employeeId', { employeeId: employee.id })
          .andWhere('s.status = :status', {
            status: SalaryStructureStatusEnum.ACTIVE,
          })
          .andWhere('s.deletedAt IS NULL')
          .andWhere('s.effectiveFrom <= :periodEnd', { periodEnd })
          .andWhere('(s.effectiveTo IS NULL OR s.effectiveTo >= :periodStart)', {
            periodStart,
          })
          .orderBy('s.effectiveFrom', 'DESC')
          .getOne();

        if (!structure?.components?.length) {
          warnings.push(
            `${employee.fullName} (${employee.employeeCode}): no active salary structure`,
          );
          continue;
        }

        const activeLines = structure.components.filter((c) => c.isActive);
        if (!activeLines.length) {
          warnings.push(
            `${employee.fullName} (${employee.employeeCode}): salary structure has no active components`,
          );
          continue;
        }

        const totals = computeSalaryTotals(
          activeLines.map((line) => ({
            componentType: line.componentType,
            calculatedAmount: Number(line.calculatedAmount),
          })),
        );

        const payslip = await payslipRepo.save(
          payslipRepo.create({
            businessId: scopedBusinessId,
            payrollRunId: run.id,
            employeeId: employee.id,
            employeeSalaryStructureId: structure.id,
            periodYear: run.periodYear,
            periodMonth: run.periodMonth,
            paymentDate: periodEnd,
            basicSalary: totals.basicSalary,
            grossSalary: totals.grossSalary,
            totalEarnings: totals.totalEarnings,
            totalDeductions: totals.totalDeductions,
            netSalary: totals.netSalary,
            currency: structure.currency,
            status: PayslipStatusEnum.DRAFT,
          }),
        );

        for (const line of activeLines) {
          await lineRepo.save(
            lineRepo.create({
              businessId: scopedBusinessId,
              payslipId: payslip.id,
              salaryComponentId: line.salaryComponentId,
              componentType: line.componentType,
              calculationType: line.calculationType,
              value: Number(line.value),
              calculatedAmount: Number(line.calculatedAmount),
            }),
          );
        }

        generatedCount += 1;
      }

      run.status = PayrollRunStatusEnum.GENERATED;
      run.generatedAt = new Date();
      run.updatedBy = actorUserId;
      await manager.getRepository(PayrollRun).save(run);
    });

    const refreshed = await this.findForBusiness(tenantDb, scopedBusinessId, id);
    const payslipCount = await tenantDb.getRepository(Payslip).count({
      where: { payrollRunId: id, deletedAt: IsNull() },
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYROLL_RUN_GENERATED',
      description: `Payroll run ${run.periodYear}-${run.periodMonth} generated`,
      metadata: { payrollRunId: id, generatedCount, warnings },
    });

    return {
      data: this.mapRun(refreshed, payslipCount),
      meta: { generatedCount, warnings },
    };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { page: number; limit: number },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);

    const [rows, total] = await tenantDb.getRepository(PayrollRun).findAndCount({
      where: { businessId: scopedBusinessId, deletedAt: IsNull() },
      relations: { payPolicy: true },
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYROLL_RUN_LISTED',
      description: 'Payroll runs listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapRun(row)),
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
    const run = await this.findForBusiness(tenantDb, scopedBusinessId, id);
    const payslipCount = await tenantDb.getRepository(Payslip).count({
      where: { payrollRunId: id, deletedAt: IsNull() },
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYROLL_RUN_VIEWED',
      description: `Payroll run ${run.periodYear}-${run.periodMonth} viewed`,
      metadata: { payrollRunId: id },
    });

    return { data: this.mapRun(run, payslipCount) };
  }
}
