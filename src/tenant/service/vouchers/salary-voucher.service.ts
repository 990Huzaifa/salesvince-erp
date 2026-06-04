import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, IsNull } from 'typeorm';
import { SalaryVoucher } from 'src/tenant-db/entities/salary-voucher.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { Payslip } from 'src/tenant-db/entities/hr/payslip.entity';
import { PayslipStatusEnum } from 'src/tenant-db/entities/hr/hr.enums';
import {
  AccountTransactionReferenceType,
} from 'src/tenant-db/entities/transaction.entity';
import { PaymentMethod, VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import {
  CreateSalaryVoucherItemDto,
  UpdateSalaryVoucherDto,
} from '../../dto/voucher/salary-voucher.dto';
import { ActivityLogService } from '../activity-log.service';
import { TransactionService } from '../transaction.service';

const VOUCHER_PREFIX = 'SV';

@Injectable()
export class SalaryVoucherService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly transactionService: TransactionService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business ID is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async generateVoucherNumber(
    manager: EntityManager,
    businessId: string,
  ): Promise<string> {
    const repo = manager.getRepository(SalaryVoucher);
    const last = await repo
      .createQueryBuilder('v')
      .where('v.businessId = :businessId', { businessId })
      .andWhere('v.voucherNumber LIKE :pattern', { pattern: `${VOUCHER_PREFIX}-%` })
      .orderBy('v.voucherNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last?.voucherNumber) {
      const suffix = last.voucherNumber.replace(`${VOUCHER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${VOUCHER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertPostableAccount(
    manager: EntityManager,
    businessId: string,
    accountId: string,
    label: string,
  ): Promise<ChartOfAccount> {
    const account = await manager.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull(), isPostable: true },
    });
    if (!account) {
      throw new BadRequestException(`${label} chart of account not found or not postable`);
    }
    return account;
  }

  private async resolvePayslipForPayment(
    manager: EntityManager,
    businessId: string,
    payslipId: string,
  ): Promise<Payslip> {
    const payslip = await manager.getRepository(Payslip).findOne({
      where: { id: payslipId, businessId, deletedAt: IsNull() },
      relations: { employee: true },
    });
    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }
    if (payslip.status !== PayslipStatusEnum.APPROVED) {
      throw new BadRequestException('Payslip must be approved before salary payment');
    }
    if (!payslip.employee?.salaryAccountId) {
      throw new BadRequestException('Employee salary payable account is missing');
    }
    return payslip;
  }

  private async assertNoPaidVoucherForPayslip(
    manager: EntityManager,
    businessId: string,
    payslipId: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = manager
      .getRepository(SalaryVoucher)
      .createQueryBuilder('v')
      .where('v.businessId = :businessId', { businessId })
      .andWhere('v.payslipId = :payslipId', { payslipId })
      .andWhere('v.status = :status', { status: VoucherStatus.PAID });

    if (excludeId) {
      qb.andWhere('v.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new BadRequestException(
        'A paid salary voucher already exists for this payslip',
      );
    }
  }

  private mapVoucher(voucher: SalaryVoucher) {
    return {
      id: voucher.id,
      businessId: voucher.businessId,
      voucherNumber: voucher.voucherNumber,
      employeeId: voucher.employeeId,
      payslipId: voucher.payslipId,
      accId: voucher.accId,
      paymentMethod: voucher.paymentMethod,
      chequeNumber: voucher.chequeNumber,
      chequeDate: voucher.chequeDate,
      bankName: voucher.bankName,
      paymentDate: voucher.paymentDate,
      paymentAmount: Number(voucher.paymentAmount),
      remarks: voucher.remarks,
      status: voucher.status,
      employee: voucher.employee
        ? {
            id: voucher.employee.id,
            fullName: voucher.employee.fullName,
            employeeCode: voucher.employee.employeeCode,
          }
        : null,
      payslip: voucher.payslip
        ? {
            id: voucher.payslip.id,
            netSalary: Number(voucher.payslip.netSalary),
            periodYear: voucher.payslip.periodYear,
            periodMonth: voucher.payslip.periodMonth,
          }
        : null,
      createdAt: voucher.createdAt,
      updatedAt: voucher.updatedAt,
    };
  }

  private async postApprovalJournal(
    manager: EntityManager,
    businessId: string,
    voucher: SalaryVoucher,
    salaryPayableAccountId: string,
  ): Promise<void> {
    const amount = this.roundAmount(Number(voucher.paymentAmount));
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    await this.transactionService.postJournal(manager, {
      businessId,
      referenceType: AccountTransactionReferenceType.SALARY_VOUCHER,
      referenceId: voucher.id,
      transactionDate: voucher.paymentDate,
      description: `Salary voucher ${voucher.voucherNumber}`,
      lines: [
        {
          chartOfAccountId: salaryPayableAccountId,
          debitAmount: amount,
          description: `Salary payment - ${voucher.voucherNumber}`,
        },
        {
          chartOfAccountId: voucher.accId,
          creditAmount: amount,
          description: `Salary payment - ${voucher.voucherNumber}`,
        },
      ],
    });
  }

  async create(
    tenantDb: DataSource,
    businessId: string,
    items: CreateSalaryVoucherItemDto[],
    userId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saved: SalaryVoucher[] = [];

    for (const dto of items) {
      const voucher = await tenantDb.transaction(async (manager) => {
        const payslip = await this.resolvePayslipForPayment(
          manager,
          scopedBusinessId,
          dto.payslipId,
        );
        await this.assertNoPaidVoucherForPayslip(
          manager,
          scopedBusinessId,
          dto.payslipId,
        );

        const paymentAmount = this.roundAmount(Number(dto.paymentAmount));
        const netSalary = this.roundAmount(Number(payslip.netSalary));
        if (paymentAmount !== netSalary) {
          throw new BadRequestException(
            `Payment amount must equal payslip net salary (${netSalary})`,
          );
        }

        await this.assertPostableAccount(
          manager,
          scopedBusinessId,
          dto.accId,
          'Payment',
        );
        await this.assertPostableAccount(
          manager,
          scopedBusinessId,
          payslip.employee!.salaryAccountId!,
          'Salary payable',
        );

        const voucherNumber = await this.generateVoucherNumber(
          manager,
          scopedBusinessId,
        );

        return manager.getRepository(SalaryVoucher).save(
          manager.getRepository(SalaryVoucher).create({
            businessId: scopedBusinessId,
            voucherNumber,
            employeeId: payslip.employeeId,
            payslipId: payslip.id,
            accId: dto.accId,
            paymentMethod: dto.paymentMethod,
            chequeNumber: dto.chequeNumber ?? null,
            chequeDate: dto.chequeDate ? new Date(dto.chequeDate) : null,
            bankName: dto.bankName ?? null,
            paymentDate: new Date(dto.paymentDate),
            paymentAmount,
            remarks: dto.remarks?.trim() ?? null,
            createdBy: userId,
            status: VoucherStatus.PENDING,
          }),
        );
      });
      saved.push(voucher);
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId: scopedBusinessId,
      action: 'SALARY_VOUCHER_CREATED',
      description: `${saved.length} salary voucher(s) created`,
      metadata: { voucherIds: saved.map((v) => v.id) },
    });

    return { vouchers: saved.map((v) => this.mapVoucher(v)) };
  }

  async createAndApprove(
    tenantDb: DataSource,
    businessId: string,
    items: CreateSalaryVoucherItemDto[],
    userId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saved: SalaryVoucher[] = [];

    for (const dto of items) {
      const voucher = await tenantDb.transaction(async (manager) => {
        const payslip = await this.resolvePayslipForPayment(
          manager,
          scopedBusinessId,
          dto.payslipId,
        );
        await this.assertNoPaidVoucherForPayslip(
          manager,
          scopedBusinessId,
          dto.payslipId,
        );

        const paymentAmount = this.roundAmount(Number(dto.paymentAmount));
        const netSalary = this.roundAmount(Number(payslip.netSalary));
        if (paymentAmount !== netSalary) {
          throw new BadRequestException(
            `Payment amount must equal payslip net salary (${netSalary})`,
          );
        }

        await this.assertPostableAccount(
          manager,
          scopedBusinessId,
          dto.accId,
          'Payment',
        );

        const salaryPayableAccountId = payslip.employee!.salaryAccountId!;
        await this.assertPostableAccount(
          manager,
          scopedBusinessId,
          salaryPayableAccountId,
          'Salary payable',
        );

        const voucherNumber = await this.generateVoucherNumber(
          manager,
          scopedBusinessId,
        );

        const created = await manager.getRepository(SalaryVoucher).save(
          manager.getRepository(SalaryVoucher).create({
            businessId: scopedBusinessId,
            voucherNumber,
            employeeId: payslip.employeeId,
            payslipId: payslip.id,
            accId: dto.accId,
            paymentMethod: dto.paymentMethod,
            chequeNumber: dto.chequeNumber ?? null,
            chequeDate: dto.chequeDate ? new Date(dto.chequeDate) : null,
            bankName: dto.bankName ?? null,
            paymentDate: new Date(dto.paymentDate),
            paymentAmount,
            remarks: dto.remarks?.trim() ?? null,
            createdBy: userId,
            status: VoucherStatus.PENDING,
          }),
        );

        created.status = VoucherStatus.PAID;
        const approved = await manager.getRepository(SalaryVoucher).save(created);
        await this.postApprovalJournal(
          manager,
          scopedBusinessId,
          approved,
          salaryPayableAccountId,
        );
        return approved;
      });
      saved.push(voucher);
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId: scopedBusinessId,
      action: 'SALARY_VOUCHER_CREATED_AND_APPROVED',
      description: `${saved.length} salary voucher(s) created and approved`,
      metadata: { voucherIds: saved.map((v) => v.id) },
    });

    return { vouchers: saved.map((v) => this.mapVoucher(v)) };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    userId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const approved = await tenantDb.transaction(async (manager) => {
      const voucher = await manager.getRepository(SalaryVoucher).findOne({
        where: { id, businessId: scopedBusinessId },
        relations: { employee: true, payslip: true },
      });
      if (!voucher) {
        throw new NotFoundException('Salary voucher not found');
      }
      if (voucher.status !== VoucherStatus.PENDING) {
        throw new BadRequestException('Only pending salary vouchers can be approved');
      }

      const payslip = await this.resolvePayslipForPayment(
        manager,
        scopedBusinessId,
        voucher.payslipId,
      );
      await this.assertNoPaidVoucherForPayslip(
        manager,
        scopedBusinessId,
        voucher.payslipId,
        voucher.id,
      );

      const salaryPayableAccountId = payslip.employee!.salaryAccountId!;
      voucher.status = VoucherStatus.PAID;
      const saved = await manager.getRepository(SalaryVoucher).save(voucher);
      await this.postApprovalJournal(
        manager,
        scopedBusinessId,
        saved,
        salaryPayableAccountId,
      );
      return saved;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId: scopedBusinessId,
      action: 'SALARY_VOUCHER_APPROVED',
      description: `Salary voucher ${approved.voucherNumber} approved`,
      metadata: { voucherId: approved.id },
    });

    return approved;
  }

  async list(
    tenantDb: DataSource,
    businessId: string,
    options: {
      page: number;
      limit: number;
      search?: string;
      status?: VoucherStatus;
    },
    userId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));

    const qb = tenantDb
      .getRepository(SalaryVoucher)
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.employee', 'employee')
      .leftJoinAndSelect('v.payslip', 'payslip')
      .where('v.businessId = :businessId', { businessId: scopedBusinessId });

    if (options.status) {
      qb.andWhere('v.status = :status', { status: options.status });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('v.voucherNumber ILIKE :search', { search })
            .orWhere('employee.fullName ILIKE :search', { search })
            .orWhere('employee.employeeCode ILIKE :search', { search });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('v.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId: scopedBusinessId,
      action: 'SALARY_VOUCHER_LISTED',
      description: 'Salary vouchers listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapVoucher(row)),
      meta: { total, page, limit },
    };
  }

  async getById(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    userId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const voucher = await tenantDb.getRepository(SalaryVoucher).findOne({
      where: { id, businessId: scopedBusinessId },
      relations: { employee: true, payslip: true },
    });
    if (!voucher) {
      throw new NotFoundException('Salary voucher not found');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId: scopedBusinessId,
      action: 'SALARY_VOUCHER_VIEWED',
      description: `Salary voucher ${voucher.voucherNumber} viewed`,
      metadata: { voucherId: voucher.id },
    });

    return { data: this.mapVoucher(voucher) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    dto: UpdateSalaryVoucherDto,
    userId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const voucher = await tenantDb.getRepository(SalaryVoucher).findOne({
      where: { id, businessId: scopedBusinessId },
    });
    if (!voucher) {
      throw new NotFoundException('Salary voucher not found');
    }
    if (voucher.status !== VoucherStatus.PENDING) {
      throw new BadRequestException('Only pending salary vouchers can be updated');
    }

    if (dto.accId !== undefined) {
      await tenantDb.transaction(async (manager) => {
        await this.assertPostableAccount(
          manager,
          scopedBusinessId,
          dto.accId!,
          'Payment',
        );
      });
      voucher.accId = dto.accId;
    }
    if (dto.paymentMethod !== undefined) {
      voucher.paymentMethod = dto.paymentMethod;
    }
    if (dto.chequeNumber !== undefined) {
      voucher.chequeNumber = dto.chequeNumber ?? null;
    }
    if (dto.chequeDate !== undefined) {
      voucher.chequeDate = dto.chequeDate ? new Date(dto.chequeDate) : null;
    }
    if (dto.bankName !== undefined) {
      voucher.bankName = dto.bankName ?? null;
    }
    if (dto.paymentDate !== undefined) {
      voucher.paymentDate = new Date(dto.paymentDate);
    }
    if (dto.paymentAmount !== undefined) {
      voucher.paymentAmount = this.roundAmount(Number(dto.paymentAmount));
    }
    if (dto.remarks !== undefined) {
      voucher.remarks = dto.remarks?.trim() ?? null;
    }

    const updated = await tenantDb.getRepository(SalaryVoucher).save(voucher);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId: scopedBusinessId,
      action: 'SALARY_VOUCHER_UPDATED',
      description: `Salary voucher ${updated.voucherNumber} updated`,
      metadata: { voucherId: updated.id },
    });

    return { data: this.mapVoucher(updated) };
  }
}
