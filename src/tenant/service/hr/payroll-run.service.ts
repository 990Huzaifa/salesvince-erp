import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { Business, BusinessStatus } from 'src/tenant-db/entities/business.entity';
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
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { CreatePayrollRunDto } from '../../dto/hr/payroll-run/create-payroll-run.dto';
import { ActivityLogService } from '../activity-log.service';
import { assertBusinessId, computeSalaryTotals } from './hr-common.util';

function getPeriodBounds(periodYear: number, periodMonth: number) {
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);
  return { periodStart, periodEnd };
}

function getPreviousMonth(ref = new Date()) {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return { periodYear: d.getFullYear(), periodMonth: d.getMonth() + 1 };
}

@Injectable()
export class PayrollRunService {
  private readonly logger = new Logger(PayrollRunService.name);
  private isPayrollCronRunning = false;

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

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
    actorUserId: string | null,
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
    actorUserId: string | null,
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

  async autoGenerateForBusiness(
    tenantDb: DataSource,
    businessId: string,
    periodYear: number,
    periodMonth: number,
  ) {
    const existing = await tenantDb.getRepository(PayrollRun).findOne({
      where: {
        businessId,
        periodYear,
        periodMonth,
        deletedAt: IsNull(),
      },
    });
    if (existing) {
      return { skipped: true as const };
    }

    const created = await this.create(
      tenantDb,
      businessId,
      { periodYear, periodMonth },
      null,
    );
    const result = await this.generate(
      tenantDb,
      businessId,
      created.data.id,
      null,
    );

    await this.activityLogService.recordSystemActivity(
      tenantDb,
      'PAYROLL_AUTO_GENERATED',
      {
        businessId,
        description: `Auto payroll generated for ${periodYear}-${periodMonth}`,
        metadata: {
          periodYear,
          periodMonth,
          generatedCount: result.meta.generatedCount,
          warnings: result.meta.warnings,
          skipped: false,
          payrollRunId: created.data.id,
        },
      },
    );

    return {
      skipped: false as const,
      payrollRunId: created.data.id,
      generatedCount: result.meta.generatedCount,
      warnings: result.meta.warnings,
    };
  }

  async autoGenerateForTenant(tenantDb: DataSource, tenantCode: string) {
    const { periodYear, periodMonth } = getPreviousMonth();
    const businesses = await tenantDb.getRepository(Business).find({
      where: { status: BusinessStatus.ACTIVE, deletedAt: IsNull() },
      select: ['id', 'code'],
    });

    const results: {
      businessId: string;
      businessCode: string;
      skipped?: boolean;
      generatedCount?: number;
      warnings?: string[];
      error?: string;
    }[] = [];

    for (const business of businesses) {
      try {
        const outcome = await this.autoGenerateForBusiness(
          tenantDb,
          business.id,
          periodYear,
          periodMonth,
        );
        if (outcome.skipped) {
          this.logger.debug(
            `Skipped auto payroll for tenant ${tenantCode}, business ${business.code}: run already exists for ${periodYear}-${periodMonth}`,
          );
          results.push({
            businessId: business.id,
            businessCode: business.code,
            skipped: true,
          });
          continue;
        }

        this.logger.log(
          `Auto payroll generated for tenant ${tenantCode}, business ${business.code}: ${outcome.generatedCount} payslip(s) for ${periodYear}-${periodMonth}`,
        );
        results.push({
          businessId: business.id,
          businessCode: business.code,
          skipped: false,
          generatedCount: outcome.generatedCount,
          warnings: outcome.warnings,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Auto payroll generation failed';
        this.logger.error(
          `Auto payroll failed for tenant ${tenantCode}, business ${business.code}`,
          error instanceof Error ? error.stack : undefined,
        );
        results.push({
          businessId: business.id,
          businessCode: business.code,
          error: message,
        });
      }
    }

    return { periodYear, periodMonth, results };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  // @Cron('0 0 1 * *')
  async generateMonthlyPayslips() {
    if (process.env.PAYROLL_AUTO_CRON_ENABLED !== 'true') {
      return;
    }
    await this.processMonthlyAutoGeneration('monthly-cron');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async testPayrollCronJob() {
    if (process.env.PAYROLL_TEST_CRON_ENABLED !== 'true') {
      return;
    }
    await this.processMonthlyAutoGeneration('test-cron');
  }

  private async processMonthlyAutoGeneration(source: string) {
    if (this.isPayrollCronRunning) {
      this.logger.warn(
        `Payroll auto-generation cron skipped (${source}): previous run still in progress`,
      );
      return;
    }

    this.isPayrollCronRunning = true;
    const { periodYear, periodMonth } = getPreviousMonth();

    try {
      const tenants = await this.tenantRepo.find({
        where: { isActive: true },
        select: { id: true, code: true },
      });

      this.logger.log(
        `Payroll auto-generation cron started (${source}) for ${periodYear}-${periodMonth}, ${tenants.length} tenant(s)`,
      );

      for (const tenant of tenants) {
        try {
          const tenantDb = await this.tenantConnectionManager.getConnection(
            tenant.id,
          );
          const summary = await this.autoGenerateForTenant(tenantDb, tenant.code);
          const generated = summary.results.filter(
            (r) => !r.skipped && !r.error,
          ).length;
          const skipped = summary.results.filter((r) => r.skipped).length;
          const failed = summary.results.filter((r) => r.error).length;
          if (generated > 0 || failed > 0) {
            this.logger.log(
              `Payroll auto-generation for tenant ${tenant.code}: ${generated} business(es) generated, ${skipped} skipped, ${failed} failed`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Payroll auto-generation failed for tenant ${tenant.code}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      this.logger.log(`Payroll auto-generation cron finished (${source})`);
    } finally {
      this.isPayrollCronRunning = false;
    }
  }
}
