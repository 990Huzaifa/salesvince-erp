import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { ActivityLogService } from './activity-log.service';
import { CreateLoanDto } from '../dto/loan/create-loan.dto';
import { UpdateLoanDto } from '../dto/loan/update-loan.dto';
import { UpdateLoanStatusDto } from '../dto/loan/update-loan-status.dto';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import {
  InstallmentFrequency,
  Loan,
  LoanStatus,
} from 'src/tenant-db/entities/loan.entity';

const LOAN_NUMBER_PREFIX = 'LN';

@Injectable()
export class LoanService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return date;
  }

  private validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async assertAccountForBusiness(
    tenantDb: DataSource,
    businessId: string,
    accountId: string,
    label: 'loanAccId' | 'receivingAccId',
  ): Promise<ChartOfAccount> {
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull() },
    });

    if (!account) {
      throw new NotFoundException(`${label} account not found`);
    }

    if (!account.isPostable) {
      throw new BadRequestException(`${label} must be a postable account`);
    }

    return account;
  }

  private async generateLoanNumber(tenantDb: DataSource): Promise<string> {
    const last = await tenantDb
      .getRepository(Loan)
      .createQueryBuilder('loan')
      .where('loan.loanNumber LIKE :prefix', {
        prefix: `${LOAN_NUMBER_PREFIX}-%`,
      })
      .orderBy('loan.loanNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.loanNumber.replace(`${LOAN_NUMBER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${LOAN_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async resolveLoanNumber(
    tenantDb: DataSource,
    loanNumber?: string,
    skipLoanId?: string,
  ): Promise<string> {
    const resolved = loanNumber?.trim() || (await this.generateLoanNumber(tenantDb));
    if (!resolved) {
      throw new BadRequestException('Loan number cannot be empty');
    }

    const qb = tenantDb.getRepository(Loan).createQueryBuilder('loan');
    qb.where('loan.loanNumber = :loanNumber', { loanNumber: resolved });
    if (skipLoanId) {
      qb.andWhere('loan.id != :skipLoanId', { skipLoanId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Loan with this loan number already exists');
    }

    return resolved;
  }

  private mapLoan(loan: Loan) {
    return {
      id: loan.id,
      businessId: loan.businessId,
      loanName: loan.loanName,
      loanType: loan.loanType,
      loanNumber: loan.loanNumber,
      loanAccId: loan.loanAccId,
      loanAcc: loan.loanAcc
        ? {
            id: loan.loanAcc.id,
            code: loan.loanAcc.code,
            name: loan.loanAcc.name,
          }
        : null,
      receivingAccId: loan.receivingAccId,
      receivingAcc: loan.receivingAcc
        ? {
            id: loan.receivingAcc.id,
            code: loan.receivingAcc.code,
            name: loan.receivingAcc.name,
          }
        : null,
      startDate: loan.startDate,
      endDate: loan.endDate,
      principalAmount: Number(loan.principalAmount),
      interestType: loan.interestType,
      interestValue: Number(loan.interestValue),
      installmentFrequency: loan.installmentFrequency,
      customInstallmentIntervalDays: loan.customInstallmentIntervalDays,
      status: loan.status,
      createdAt: loan.createdAt,
      updatedAt: loan.updatedAt,
    };
  }

  private loanQueryForBusiness(tenantDb: DataSource, businessId: string) {
    return tenantDb
      .getRepository(Loan)
      .createQueryBuilder('loan')
      .where('loan.businessId = :businessId', { businessId })
      .andWhere('loan.deletedAt IS NULL');
  }

  private async findLoanForBusiness(
    tenantDb: DataSource,
    businessId: string,
    loanId: string,
  ): Promise<Loan> {
    const loan = await this.loanQueryForBusiness(tenantDb, businessId)
      .leftJoinAndSelect('loan.loanAcc', 'loanAcc')
      .leftJoinAndSelect('loan.receivingAcc', 'receivingAcc')
      .andWhere('loan.id = :loanId', { loanId })
      .getOne();

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    return loan;
  }

  private assertDraft(loan: Loan): void {
    if (loan.status !== LoanStatus.DRAFT) {
      throw new BadRequestException('Only draft loans can be edited');
    }
  }

  private assertCustomFrequencyPayload(
    installmentFrequency: InstallmentFrequency,
    customInstallmentIntervalDays: number | null | undefined,
  ): number | null {
    if (installmentFrequency !== InstallmentFrequency.CUSTOM) {
      return null;
    }

    if (
      customInstallmentIntervalDays == null ||
      Number(customInstallmentIntervalDays) < 1
    ) {
      throw new BadRequestException(
        'customInstallmentIntervalDays is required for CUSTOM installment frequency',
      );
    }

    return Math.floor(Number(customInstallmentIntervalDays));
  }

  private assertAllowedStatusTransition(
    currentStatus: LoanStatus,
    nextStatus: LoanStatus,
  ): void {
    if (currentStatus === nextStatus) {
      throw new BadRequestException(`Loan is already ${nextStatus}`);
    }

    const transitions: Record<LoanStatus, LoanStatus[]> = {
      [LoanStatus.DRAFT]: [LoanStatus.APPROVED, LoanStatus.CANCELLED],
      [LoanStatus.APPROVED]: [LoanStatus.ACTIVE, LoanStatus.CANCELLED],
      [LoanStatus.ACTIVE]: [
        LoanStatus.PARTIALLY_PAID,
        LoanStatus.CLOSED,
        LoanStatus.CANCELLED,
      ],
      [LoanStatus.PARTIALLY_PAID]: [
        LoanStatus.ACTIVE,
        LoanStatus.CLOSED,
        LoanStatus.CANCELLED,
      ],
      [LoanStatus.CLOSED]: [],
      [LoanStatus.CANCELLED]: [],
    };

    if (!transitions[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Status transition not allowed: ${currentStatus} -> ${nextStatus}`,
      );
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateLoanDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const startDate = this.parseDate(dto.startDate, 'startDate');
    const endDate = this.parseDate(dto.endDate, 'endDate');
    this.validateDateRange(startDate, endDate);

    await this.assertAccountForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.loanAccId,
      'loanAccId',
    );
    await this.assertAccountForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.receivingAccId,
      'receivingAccId',
    );

    const loanNumber = await this.resolveLoanNumber(tenantDb, dto.loanNumber);
    const installmentFrequency =
      dto.installmentFrequency ?? InstallmentFrequency.MONTHLY;
    const customInstallmentIntervalDays = this.assertCustomFrequencyPayload(
      installmentFrequency,
      dto.customInstallmentIntervalDays,
    );

    const created = await tenantDb.getRepository(Loan).save(
      tenantDb.getRepository(Loan).create({
        businessId: scopedBusinessId,
        loanName: dto.loanName.trim(),
        loanType: dto.loanType,
        loanNumber,
        loanAccId: dto.loanAccId,
        receivingAccId: dto.receivingAccId,
        startDate,
        endDate,
        principalAmount: this.roundAmount(Number(dto.principalAmount)),
        interestType: dto.interestType,
        interestValue: Number(dto.interestValue ?? 0),
        installmentFrequency,
        customInstallmentIntervalDays,
        status: LoanStatus.DRAFT,
      }),
    );

    const loaded = await this.findLoanForBusiness(
      tenantDb,
      scopedBusinessId,
      created.id,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LOAN_CREATED',
      description: `Loan ${loaded.loanNumber} created`,
      metadata: { loanId: loaded.id, loanNumber: loaded.loanNumber },
    });

    return { data: this.mapLoan(loaded) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      status?: LoanStatus;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, options.limit || 10);
    const skip = (page - 1) * limit;

    const qb = this.loanQueryForBusiness(tenantDb, scopedBusinessId)
      .leftJoinAndSelect('loan.loanAcc', 'loanAcc')
      .leftJoinAndSelect('loan.receivingAcc', 'receivingAcc');

    if (options.status) {
      qb.andWhere('loan.status = :status', { status: options.status });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('loan.loanName ILIKE :search', { search })
            .orWhere('loan.loanNumber ILIKE :search', { search })
            .orWhere('loanAcc.name ILIKE :search', { search })
            .orWhere('receivingAcc.name ILIKE :search', { search });
        }),
      );
    }

    const [loans, total] = await qb
      .orderBy('loan.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LOAN_LISTED',
      description: 'Loans listed',
      metadata: { total, page, limit },
    });

    return {
      data: loans.map((loan) => this.mapLoan(loan)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    loanId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const loan = await this.findLoanForBusiness(tenantDb, scopedBusinessId, loanId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LOAN_VIEWED',
      description: `Loan ${loan.loanNumber} viewed`,
      metadata: { loanId: loan.id, loanNumber: loan.loanNumber },
    });

    return { data: this.mapLoan(loan) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    loanId: string,
    dto: UpdateLoanDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const loan = await this.findLoanForBusiness(tenantDb, scopedBusinessId, loanId);
    this.assertDraft(loan);

    if (dto.loanName !== undefined) {
      loan.loanName = dto.loanName.trim();
    }

    if (dto.loanType !== undefined) {
      loan.loanType = dto.loanType;
    }

    if (dto.loanNumber !== undefined) {
      loan.loanNumber = await this.resolveLoanNumber(
        tenantDb,
        dto.loanNumber,
        loan.id,
      );
    }

    if (dto.loanAccId !== undefined) {
      await this.assertAccountForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.loanAccId,
        'loanAccId',
      );
      loan.loanAccId = dto.loanAccId;
    }

    if (dto.receivingAccId !== undefined) {
      await this.assertAccountForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.receivingAccId,
        'receivingAccId',
      );
      loan.receivingAccId = dto.receivingAccId;
    }

    const startDate =
      dto.startDate !== undefined
        ? this.parseDate(dto.startDate, 'startDate')
        : loan.startDate;
    const endDate =
      dto.endDate !== undefined ? this.parseDate(dto.endDate, 'endDate') : loan.endDate;
    this.validateDateRange(startDate, endDate);
    loan.startDate = startDate;
    loan.endDate = endDate;

    if (dto.principalAmount !== undefined) {
      loan.principalAmount = this.roundAmount(Number(dto.principalAmount));
    }

    if (dto.interestType !== undefined) {
      loan.interestType = dto.interestType;
    }

    if (dto.interestValue !== undefined) {
      loan.interestValue = Number(dto.interestValue);
    }

    if (dto.installmentFrequency !== undefined) {
      loan.installmentFrequency = dto.installmentFrequency;
    }

    loan.customInstallmentIntervalDays = this.assertCustomFrequencyPayload(
      loan.installmentFrequency,
      dto.customInstallmentIntervalDays ?? loan.customInstallmentIntervalDays,
    );

    const updated = await tenantDb.getRepository(Loan).save(loan);
    const loaded = await this.findLoanForBusiness(
      tenantDb,
      scopedBusinessId,
      updated.id,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LOAN_UPDATED',
      description: `Loan ${loaded.loanNumber} updated`,
      metadata: { loanId: loaded.id, loanNumber: loaded.loanNumber },
    });

    return { data: this.mapLoan(loaded) };
  }

  async updateStatus(
    tenantDb: DataSource,
    businessId: string | undefined,
    loanId: string,
    dto: UpdateLoanStatusDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const loan = await this.findLoanForBusiness(tenantDb, scopedBusinessId, loanId);

    this.assertAllowedStatusTransition(loan.status, dto.status);
    loan.status = dto.status;
    await tenantDb.getRepository(Loan).save(loan);

    const loaded = await this.findLoanForBusiness(
      tenantDb,
      scopedBusinessId,
      loan.id,
    );
    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LOAN_STATUS_CHANGED',
      description: `Loan ${loaded.loanNumber} status changed to ${loaded.status}`,
      metadata: { loanId: loaded.id, loanNumber: loaded.loanNumber, status: loaded.status },
    });

    return { data: this.mapLoan(loaded) };
  }
}
