import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  AccountTransactionReferenceType,
} from 'src/tenant-db/entities/transaction.entity';
import {
  Employee,
  Payslip,
  PayslipLine,
  PayrollRun,
} from 'src/tenant-db/entities/hr';
import {
  ComponentTypeEnum,
  PayslipStatusEnum,
} from 'src/tenant-db/entities/hr/hr.enums';
import { ActivityLogService } from '../activity-log.service';
import { TransactionService } from '../transaction.service';
import { assertBusinessId, roundAmount } from './hr-common.util';

@Injectable()
export class PayslipService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly transactionService: TransactionService,
  ) {}

  private mapLine(line: PayslipLine) {
    return {
      id: line.id,
      salaryComponentId: line.salaryComponentId,
      componentType: line.componentType,
      calculationType: line.calculationType,
      value: Number(line.value),
      calculatedAmount: Number(line.calculatedAmount),
      salaryComponent: line.salaryComponent
        ? {
            id: line.salaryComponent.id,
            name: line.salaryComponent.name,
            code: line.salaryComponent.code,
            accountId: line.salaryComponent.accountId,
          }
        : null,
    };
  }

  private mapPayslip(payslip: Payslip, withLines = false) {
    return {
      id: payslip.id,
      businessId: payslip.businessId,
      payrollRunId: payslip.payrollRunId,
      employeeId: payslip.employeeId,
      employeeSalaryStructureId: payslip.employeeSalaryStructureId,
      periodYear: payslip.periodYear,
      periodMonth: payslip.periodMonth,
      paymentDate: payslip.paymentDate,
      basicSalary: Number(payslip.basicSalary),
      grossSalary: Number(payslip.grossSalary),
      totalEarnings: Number(payslip.totalEarnings),
      totalDeductions: Number(payslip.totalDeductions),
      netSalary: Number(payslip.netSalary),
      currency: payslip.currency,
      status: payslip.status,
      approvedAt: payslip.approvedAt,
      approvedBy: payslip.approvedBy,
      employee: payslip.employee
        ? {
            id: payslip.employee.id,
            fullName: payslip.employee.fullName,
            employeeCode: payslip.employee.employeeCode,
            salaryAccountId: payslip.employee.salaryAccountId,
          }
        : null,
      lines:
        withLines && payslip.lines
          ? payslip.lines.map((line) => this.mapLine(line))
          : undefined,
      createdAt: payslip.createdAt,
      updatedAt: payslip.updatedAt,
    };
  }

  private async findForBusiness(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    withLines = false,
  ): Promise<Payslip> {
    const row = await tenantDb.getRepository(Payslip).findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: withLines
        ? {
            employee: true,
            lines: { salaryComponent: true },
          }
        : { employee: true },
    });
    if (!row) {
      throw new NotFoundException('Payslip not found');
    }
    if (row.lines) {
      row.lines.sort((a, b) =>
        (a.salaryComponent?.name ?? '').localeCompare(
          b.salaryComponent?.name ?? '',
        ),
      );
    }
    return row;
  }

  private buildPayslipJournalLines(
    payslip: Payslip,
    employee: Employee,
  ): { chartOfAccountId: string; debitAmount?: number; creditAmount?: number; description?: string }[] {
    if (!employee.salaryAccountId) {
      throw new BadRequestException(
        `Employee ${employee.fullName} does not have a salary payable account`,
      );
    }

    const lines: {
      chartOfAccountId: string;
      debitAmount?: number;
      creditAmount?: number;
      description?: string;
    }[] = [];

    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of payslip.lines ?? []) {
      const amount = roundAmount(Number(line.calculatedAmount));
      if (amount <= 0) {
        continue;
      }

      const accountId = line.salaryComponent?.accountId;
      if (!accountId) {
        throw new BadRequestException(
          `Salary component ${line.salaryComponent?.name ?? line.salaryComponentId} has no linked chart of account`,
        );
      }

      if (line.componentType === ComponentTypeEnum.EARNING) {
        lines.push({
          chartOfAccountId: accountId,
          debitAmount: amount,
          description: `${line.salaryComponent?.name ?? 'Earning'} - payslip`,
        });
        totalDebits += amount;
      } else {
        lines.push({
          chartOfAccountId: accountId,
          creditAmount: amount,
          description: `${line.salaryComponent?.name ?? 'Deduction'} - payslip`,
        });
        totalCredits += amount;
      }
    }

    const netSalary = roundAmount(Number(payslip.netSalary));
    lines.push({
      chartOfAccountId: employee.salaryAccountId,
      creditAmount: netSalary,
      description: `Net salary payable - ${employee.fullName}`,
    });
    totalCredits += netSalary;

    totalDebits = roundAmount(totalDebits);
    totalCredits = roundAmount(totalCredits);

    if (totalDebits !== totalCredits) {
      throw new BadRequestException(
        `Payslip journal is not balanced (debits ${totalDebits}, credits ${totalCredits})`,
      );
    }

    return lines;
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);

    const approved = await tenantDb.transaction(async (manager) => {
      const payslip = await manager.getRepository(Payslip).findOne({
        where: { id, businessId: scopedBusinessId, deletedAt: IsNull() },
        relations: {
          employee: true,
          lines: { salaryComponent: true },
        },
      });
      if (!payslip) {
        throw new NotFoundException('Payslip not found');
      }
      if (payslip.status !== PayslipStatusEnum.DRAFT) {
        throw new BadRequestException('Only draft payslips can be approved');
      }

      const journalLines = this.buildPayslipJournalLines(
        payslip,
        payslip.employee,
      );

      await this.transactionService.postJournal(manager, {
        businessId: scopedBusinessId,
        referenceType: AccountTransactionReferenceType.PAYSLIP,
        referenceId: payslip.id,
        transactionDate: payslip.paymentDate,
        description: `Payslip ${payslip.periodYear}-${payslip.periodMonth} - ${payslip.employee.fullName}`,
        lines: journalLines,
      });

      payslip.status = PayslipStatusEnum.APPROVED;
      payslip.approvedAt = new Date();
      payslip.approvedBy = actorUserId;
      return manager.getRepository(Payslip).save(payslip);
    });

    const full = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      approved.id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYSLIP_APPROVED',
      description: `Payslip approved for ${full.employee?.fullName ?? full.employeeId}`,
      metadata: { payslipId: full.id },
    });

    return { data: this.mapPayslip(full, true) };
  }

  async approveAllForRun(
    tenantDb: DataSource,
    businessId: string | undefined,
    payrollRunId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const run = await tenantDb.getRepository(PayrollRun).findOne({
      where: { id: payrollRunId, businessId: scopedBusinessId, deletedAt: IsNull() },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    const drafts = await tenantDb.getRepository(Payslip).find({
      where: {
        payrollRunId,
        businessId: scopedBusinessId,
        status: PayslipStatusEnum.DRAFT,
        deletedAt: IsNull(),
      },
      select: ['id'],
    });

    const approvedIds: string[] = [];
    const errors: { payslipId: string; message: string }[] = [];

    for (const draft of drafts) {
      try {
        await this.approve(tenantDb, scopedBusinessId, draft.id, actorUserId);
        approvedIds.push(draft.id);
      } catch (err) {
        errors.push({
          payslipId: draft.id,
          message: err instanceof Error ? err.message : 'Approval failed',
        });
      }
    }

    return {
      data: { approvedCount: approvedIds.length, approvedIds, errors },
    };
  }

  async cancel(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const payslip = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    if (payslip.status !== PayslipStatusEnum.DRAFT) {
      throw new BadRequestException('Only draft payslips can be cancelled');
    }

    payslip.status = PayslipStatusEnum.CANCELLED;
    await tenantDb.getRepository(Payslip).save(payslip);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYSLIP_CANCELLED',
      description: `Payslip cancelled for ${payslip.employee?.fullName ?? payslip.employeeId}`,
      metadata: { payslipId: payslip.id },
    });

    return { data: this.mapPayslip(payslip) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      payrollRunId?: string;
      employeeId?: string;
      status?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);

    const qb = tenantDb
      .getRepository(Payslip)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.employee', 'employee')
      .where('p.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('p.deletedAt IS NULL');

    if (options.payrollRunId) {
      qb.andWhere('p.payrollRunId = :payrollRunId', {
        payrollRunId: options.payrollRunId,
      });
    }
    if (options.employeeId) {
      qb.andWhere('p.employeeId = :employeeId', {
        employeeId: options.employeeId,
      });
    }
    if (options.status) {
      qb.andWhere('p.status = :status', { status: options.status });
    }

    const [rows, total] = await qb
      .orderBy('employee.fullName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAYSLIP_LISTED',
      description: 'Payslips listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapPayslip(row)),
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
      action: 'PAYSLIP_VIEWED',
      description: `Payslip viewed for ${row.employee?.fullName ?? row.employeeId}`,
      metadata: { payslipId: row.id },
    });

    return { data: this.mapPayslip(row, true) };
  }
}
