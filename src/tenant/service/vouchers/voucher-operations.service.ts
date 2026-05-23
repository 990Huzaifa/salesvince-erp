import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  IsNull,
  Repository,
} from 'typeorm';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from 'src/tenant-db/entities/voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { TransactionService } from '../transaction.service';
import {
  ContraVoucherPayload,
  ExpenseVoucherPayload,
  PartyVoucherPayload,
  VoucherConfig,
  VoucherCreateInput,
  VoucherCreatePayload,
  VoucherEntity,
  VoucherListOptions,
  VoucherPaymentPayload,
  VoucherUpdatePayload,
} from './voucher.types';

@Injectable()
export class VoucherOperationsService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private roundAmount(value: number): number {
    return Math.round(Number(value) * 100) / 100;
  }

  private getRepo<T extends VoucherEntity>(
    source: DataSource | EntityManager,
    entity: EntityTarget<T>,
  ): Repository<T> {
    return source.getRepository(entity) as Repository<T>;
  }

  private async generateVoucherNumber<T extends VoucherEntity>(
    manager: EntityManager,
    config: VoucherConfig<T>,
  ): Promise<string> {
    const prefix = config.numberPrefix;
    const alias = 'voucher';
    const last = await this.getRepo(manager, config.entity)
      .createQueryBuilder(alias)
      .where(`${alias}.voucherNumber LIKE :pattern`, {
        pattern: `${prefix}-%`,
      })
      .orderBy(`${alias}.voucherNumber`, 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = String(last.voucherNumber).replace(`${prefix}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${prefix}-${String(next).padStart(5, '0')}`;
  }

  private async resolveCreatePayload<T extends VoucherEntity>(
    manager: EntityManager,
    config: VoucherConfig<T>,
    dto: VoucherCreateInput,
  ): Promise<VoucherCreatePayload> {
    const voucherNumber = await this.generateVoucherNumber(manager, config);
    return { ...dto, voucherNumber } as VoucherCreatePayload;
  }

  private applyPaymentFields(
    target: VoucherEntity,
    dto: VoucherPaymentPayload,
  ): void {
    if (!dto.voucherNumber?.trim()) {
      throw new BadRequestException('Voucher number is required');
    }
    target.voucherNumber = dto.voucherNumber.trim();
    target.paymentMethod = String(dto.paymentMethod);
    target.paymentDate =
      dto.paymentDate instanceof Date
        ? dto.paymentDate
        : new Date(dto.paymentDate);
    target.paymentAmount = this.roundAmount(dto.paymentAmount);
    target.remarks = dto.remarks?.trim() ?? null;
    const isCheque = dto.paymentMethod === PaymentMethod.CHEQUE;
    target.chequeNumber = isCheque ? dto.chequeNumber?.trim() ?? null : null;
    target.chequeDate =
      isCheque && dto.chequeDate ? new Date(dto.chequeDate) : null;
    target.bankName = isCheque ? dto.bankName?.trim() ?? null : null;
  }

  private async assertUniqueVoucherNumber<T extends VoucherEntity>(
    repo: Repository<T>,
    voucherNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await repo.findOne({
      where: { voucherNumber } as never,
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Voucher number ${voucherNumber} already exists`,
      );
    }
  }

  private async loadPartyForBusiness(
    manager: EntityManager,
    businessId: string,
    partyId: string,
  ): Promise<Party> {
    const party = await manager.getRepository(Party).findOne({
      where: { id: partyId, businessId, deletedAt: IsNull() },
    });
    if (!party) {
      throw new NotFoundException('Party not found');
    }
    return party;
  }

  private resolvePartyLedgerAccountId(
    party: Party,
    side: 'receivable' | 'payable',
  ): string {
    const accountId =
      side === 'receivable'
        ? party.receivableAccountId
        : party.payableAccountId;

    if (!accountId) {
      throw new BadRequestException(
        `Party ${party.name} does not have a ${side} chart of account`,
      );
    }

    return accountId;
  }

  private async assertPostableAccount(
    manager: EntityManager,
    businessId: string,
    accountId: string,
    label: string,
  ): Promise<ChartOfAccount> {
    const account = await manager.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException(`${label} chart of account not found`);
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `${label} account ${account.code} is not postable`,
      );
    }
    return account;
  }

  private async validatePartyVoucherAccounts(
    manager: EntityManager,
    businessId: string,
    partyId: string,
    accId: string,
    partyLedgerSide: 'receivable' | 'payable',
  ): Promise<{ party: Party; partyLedgerAccountId: string }> {
    const party = await this.loadPartyForBusiness(manager, businessId, partyId);
    const partyLedgerAccountId = this.resolvePartyLedgerAccountId(
      party,
      partyLedgerSide,
    );

    if (
      partyLedgerSide === 'receivable' &&
      party.type === PartyType.VENDOR
    ) {
      throw new BadRequestException(
        'Receivable vouchers are not allowed for vendor-only parties',
      );
    }
    if (
      partyLedgerSide === 'payable' &&
      party.type === PartyType.CUSTOMER
    ) {
      throw new BadRequestException(
        'Payable vouchers are not allowed for customer-only parties',
      );
    }

    await this.assertPostableAccount(manager, businessId, accId, 'Payment');
    await this.assertPostableAccount(
      manager,
      businessId,
      partyLedgerAccountId,
      'Party ledger',
    );

    return { party, partyLedgerAccountId };
  }

  private buildFullCreatePayload<T extends VoucherEntity>(
    voucher: T,
    config: VoucherConfig<T>,
    dto: VoucherUpdatePayload,
  ): VoucherCreatePayload {
    const payment: VoucherPaymentPayload = {
      voucherNumber: voucher.voucherNumber,
      paymentMethod: dto.paymentMethod ?? voucher.paymentMethod,
      paymentDate: dto.paymentDate ?? voucher.paymentDate,
      paymentAmount:
        dto.paymentAmount !== undefined
          ? this.roundAmount(Number(dto.paymentAmount))
          : this.roundAmount(Number(voucher.paymentAmount)),
      chequeNumber: dto.chequeNumber ?? voucher.chequeNumber ?? undefined,
      chequeDate:
        dto.chequeDate ??
        (voucher.chequeDate ? voucher.chequeDate.toISOString() : undefined),
      bankName: dto.bankName ?? voucher.bankName ?? undefined,
      remarks: dto.remarks ?? voucher.remarks ?? undefined,
    };

    if (config.hasParty) {
      return {
        ...payment,
        partyId: dto.partyId ?? voucher.partyId!,
        accId: dto.accId ?? voucher.accId!,
        invoiceId:
          dto.invoiceId !== undefined
            ? dto.invoiceId
            : voucher.invoiceId ?? undefined,
      };
    }

    if (config.referenceType === 'EXPENSE_VOUCHER') {
      return {
        ...payment,
        expenseAccId: dto.expenseAccId ?? voucher.expenseAccId!,
        accId: dto.accId ?? voucher.accId!,
      };
    }

    return {
      ...payment,
      fromAccId: dto.fromAccId ?? voucher.fromAccId!,
      toAccId: dto.toAccId ?? voucher.toAccId!,
    };
  }

  private async validateCreatePayload<T extends VoucherEntity>(
    manager: EntityManager,
    businessId: string,
    config: VoucherConfig<T>,
    dto: VoucherCreatePayload,
  ): Promise<{ partyLedgerAccountId?: string }> {
    const voucherNumber = dto.voucherNumber?.trim();
    if (!voucherNumber) {
      throw new BadRequestException('Voucher number is required');
    }
    await this.assertUniqueVoucherNumber(
      this.getRepo(manager, config.entity),
      voucherNumber,
    );

    if (config.hasParty) {
      const { partyId, accId } = dto as PartyVoucherPayload;
      const partyLedgerSide =
        config.referenceType === 'PAYMENT_VOUCHER' ||
        config.referenceType === 'PURCHASE_RETURN_VOUCHER'
          ? 'payable'
          : 'receivable';
      const { partyLedgerAccountId } = await this.validatePartyVoucherAccounts(
        manager,
        businessId,
        partyId,
        accId,
        partyLedgerSide,
      );
      return { partyLedgerAccountId };
    }

    if (config.referenceType === 'EXPENSE_VOUCHER') {
      const { expenseAccId, accId } = dto as ExpenseVoucherPayload;
      await this.assertPostableAccount(
        manager,
        businessId,
        expenseAccId,
        'Expense',
      );
      await this.assertPostableAccount(manager, businessId, accId, 'Payment');
      return {};
    }

    if (config.referenceType === 'CONTRA_VOUCHER') {
      const { fromAccId, toAccId } = dto as ContraVoucherPayload;
      if (fromAccId === toAccId) {
        throw new BadRequestException(
          'Source and destination accounts must be different',
        );
      }
      await this.assertPostableAccount(
        manager,
        businessId,
        fromAccId,
        'Source',
      );
      await this.assertPostableAccount(
        manager,
        businessId,
        toAccId,
        'Destination',
      );
      return {};
    }

    return {};
  }

  private buildEntityFromCreate<T extends VoucherEntity>(
    config: VoucherConfig<T>,
    dto: VoucherCreatePayload,
    userId: string,
  ): T {
    const repo = {} as T;
    this.applyPaymentFields(repo, dto);
    repo.status = VoucherStatus.PENDING;
    repo.createdBy = userId;

    if (config.hasParty) {
      const partyDto = dto as PartyVoucherPayload;
      repo.partyId = partyDto.partyId;
      repo.accId = partyDto.accId;
      if (partyDto.invoiceId !== undefined) {
        repo.invoiceId = partyDto.invoiceId ?? null;
      }
    } else if (config.referenceType === 'EXPENSE_VOUCHER') {
      const expenseDto = dto as ExpenseVoucherPayload;
      repo.expenseAccId = expenseDto.expenseAccId;
      repo.accId = expenseDto.accId;
    } else if (config.referenceType === 'CONTRA_VOUCHER') {
      const contraDto = dto as ContraVoucherPayload;
      repo.fromAccId = contraDto.fromAccId;
      repo.toAccId = contraDto.toAccId;
    }

    return repo;
  }

  private applyUpdateFields<T extends VoucherEntity>(
    voucher: T,
    config: VoucherConfig<T>,
    dto: VoucherUpdatePayload,
  ): void {
    if (dto.paymentMethod !== undefined) {
      voucher.paymentMethod = dto.paymentMethod as string;
    }
    if (dto.paymentDate !== undefined) {
      voucher.paymentDate = new Date(String(dto.paymentDate));
    }
    if (dto.paymentAmount !== undefined) {
      voucher.paymentAmount = this.roundAmount(Number(dto.paymentAmount));
    }
    if (dto.remarks !== undefined) {
      voucher.remarks = dto.remarks ? String(dto.remarks).trim() : null;
    }
    if (dto.chequeNumber !== undefined) {
      voucher.chequeNumber = dto.chequeNumber
        ? String(dto.chequeNumber).trim()
        : null;
    }
    if (dto.chequeDate !== undefined) {
      voucher.chequeDate = dto.chequeDate
        ? new Date(String(dto.chequeDate))
        : null;
    }
    if (dto.bankName !== undefined) {
      voucher.bankName = dto.bankName ? String(dto.bankName).trim() : null;
    }

    if (config.hasParty) {
      if (dto.partyId !== undefined) {
        voucher.partyId = String(dto.partyId);
      }
      if (dto.accId !== undefined) {
        voucher.accId = String(dto.accId);
      }
      if (dto.invoiceId !== undefined) {
        voucher.invoiceId = dto.invoiceId ? String(dto.invoiceId) : null;
      }
    } else if (config.referenceType === 'EXPENSE_VOUCHER') {
      if (dto.expenseAccId !== undefined) {
        voucher.expenseAccId = String(dto.expenseAccId);
      }
      if (dto.accId !== undefined) {
        voucher.accId = String(dto.accId);
      }
    } else if (config.referenceType === 'CONTRA_VOUCHER') {
      if (dto.fromAccId !== undefined) {
        voucher.fromAccId = String(dto.fromAccId);
      }
      if (dto.toAccId !== undefined) {
        voucher.toAccId = String(dto.toAccId);
      }
    }
  }

  private assertEditable(voucher: VoucherEntity): void {
    if (voucher.status !== VoucherStatus.PENDING) {
      throw new BadRequestException('Only pending vouchers can be modified');
    }
  }

  private async resolvePartyLedgerForVoucher<T extends VoucherEntity>(
    manager: EntityManager,
    businessId: string,
    config: VoucherConfig<T>,
    voucher: T,
  ): Promise<string | undefined> {
    if (!config.hasParty) {
      return undefined;
    }

    const partyLedgerSide =
      config.referenceType === 'PAYMENT_VOUCHER' ||
      config.referenceType === 'PURCHASE_RETURN_VOUCHER'
        ? 'payable'
        : 'receivable';

    const { partyLedgerAccountId } = await this.validatePartyVoucherAccounts(
      manager,
      businessId,
      voucher.partyId!,
      voucher.accId!,
      partyLedgerSide,
    );
    return partyLedgerAccountId;
  }

  private async postApprovalJournal<T extends VoucherEntity>(
    manager: EntityManager,
    businessId: string,
    config: VoucherConfig<T>,
    voucher: T,
    partyLedgerAccountId?: string,
  ): Promise<void> {
    const amount = this.roundAmount(Number(voucher.paymentAmount));
    const lines = config.buildJournalLines(voucher, partyLedgerAccountId).map(
      (line) => ({
        ...line,
        debitAmount: line.debitAmount
          ? this.roundAmount(line.debitAmount)
          : undefined,
        creditAmount: line.creditAmount
          ? this.roundAmount(line.creditAmount)
          : undefined,
      }),
    );

    if (this.roundAmount(amount) <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    await this.transactionService.postJournal(manager, {
      businessId,
      referenceType: config.referenceType,
      referenceId: voucher.id,
      partyId: voucher.partyId ?? null,
      transactionDate: voucher.paymentDate,
      description: `${config.activityKey} ${voucher.voucherNumber}`,
      lines,
    });
  }

  async create<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    items: VoucherCreateInput[],
    userId: string,
  ) {
    const saved: T[] = [];

    for (const dto of items) {
      const voucher = await tenantDb.transaction(async (manager) => {
        const payload = await this.resolveCreatePayload(manager, config, dto);
        await this.validateCreatePayload(manager, businessId, config, payload);
        const entity = this.buildEntityFromCreate(config, payload, userId);
        return this.getRepo(manager, config.entity).save(entity);
      });
      saved.push(voucher);
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId,
      action: `${config.activityKey}_CREATED`,
      description: `${saved.length} ${config.activityKey}(s) created`,
      metadata: { voucherIds: saved.map((v) => v.id) },
    });

    return { vouchers: saved };
  }

  async createAndApprove<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    items: VoucherCreateInput[],
    userId: string,
  ) {
    const saved: T[] = [];

    for (const dto of items) {
      const voucher = await tenantDb.transaction(async (manager) => {
        const payload = await this.resolveCreatePayload(manager, config, dto);
        const validation = await this.validateCreatePayload(
          manager,
          businessId,
          config,
          payload,
        );
        const entity = this.buildEntityFromCreate(config, payload, userId);
        const created = await this.getRepo(manager, config.entity).save(entity);
        const partyLedgerAccountId =
          validation.partyLedgerAccountId ??
          (config.hasParty
            ? await this.resolvePartyLedgerForVoucher(
                manager,
                businessId,
                config,
                created,
              )
            : undefined);

        created.status = VoucherStatus.PAID;
        const approved = await this.getRepo(manager, config.entity).save(created);
        await this.postApprovalJournal(
          manager,
          businessId,
          config,
          approved,
          partyLedgerAccountId,
        );
        return approved;
      });
      saved.push(voucher);
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId,
      action: `${config.activityKey}_CREATED_AND_APPROVED`,
      description: `${saved.length} ${config.activityKey}(s) created and approved`,
      metadata: { voucherIds: saved.map((v) => v.id) },
    });

    return { vouchers: saved };
  }

  async list<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    options: VoucherListOptions,
    userId: string,
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
    const alias = 'voucher';

    const qb = tenantDb
      .getRepository(config.entity)
      .createQueryBuilder(alias);

    if (config.hasParty) {
      qb.innerJoinAndSelect(`${alias}.party`, 'party')
        .innerJoinAndSelect(`${alias}.acc`, 'acc')
        .where('party.businessId = :businessId', { businessId });
    } else if (config.referenceType === 'CONTRA_VOUCHER') {
      qb.innerJoinAndSelect(`${alias}.fromAcc`, 'fromAcc')
        .innerJoinAndSelect(`${alias}.toAcc`, 'toAcc')
        .where('fromAcc.businessId = :businessId', { businessId });
    } else {
      qb.innerJoinAndSelect(`${alias}.acc`, 'acc')
        .leftJoinAndSelect(`${alias}.expenseAcc`, 'expenseAcc')
        .where('acc.businessId = :businessId', { businessId });
    }
    qb.leftJoinAndSelect(`${alias}.createdByUser`, 'createdByUser');

    if (options.status) {
      qb.andWhere(`${alias}.status = :status`, { status: options.status });
    }

    if (options.search?.trim()) {
      qb.andWhere(`${alias}.voucherNumber ILIKE :search`, {
        search: `%${options.search.trim()}%`,
      });
    }

    qb.orderBy(`${alias}.createdAt`, 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [vouchers, total] = await qb.getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId,
      action: `${config.activityKey}_LISTED`,
      description: `${config.activityKey} list fetched`,
      metadata: { total, page, limit },
    });

    return { result: vouchers, meta: { total, page, limit } };
  }

  async getById<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    id: string,
    userId: string,
  ) {
    const voucher = await this.findVoucherOrThrow(
      tenantDb,
      businessId,
      config,
      id,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId,
      action: `${config.activityKey}_VIEWED`,
      description: `${config.activityKey} ${voucher.voucherNumber} viewed`,
      metadata: { voucherId: voucher.id },
    });

    return voucher;
  }

  private async findVoucherOrThrow<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    id: string,
  ): Promise<T> {
    const alias = 'voucher';
    const qb = tenantDb
      .getRepository(config.entity)
      .createQueryBuilder(alias)
      .where(`${alias}.id = :id`, { id });

    if (config.hasParty) {
      qb.innerJoinAndSelect(`${alias}.party`, 'party')
        .innerJoinAndSelect(`${alias}.acc`, 'acc')
        .andWhere('party.businessId = :businessId', { businessId });
    } else if (config.referenceType === 'CONTRA_VOUCHER') {
      qb.innerJoinAndSelect(`${alias}.fromAcc`, 'fromAcc')
        .innerJoinAndSelect(`${alias}.toAcc`, 'toAcc')
        .andWhere('fromAcc.businessId = :businessId', { businessId });
    } else {
      qb.innerJoinAndSelect(`${alias}.acc`, 'acc')
        .leftJoinAndSelect(`${alias}.expenseAcc`, 'expenseAcc')
        .andWhere('acc.businessId = :businessId', { businessId });
    }

    qb.leftJoinAndSelect(`${alias}.createdByUser`, 'createdByUser');

    const voucher = await qb.getOne();
    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }
    return voucher as T;
  }

  async edit<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    id: string,
    dto: VoucherUpdatePayload,
    userId: string,
  ) {
    const updated = await tenantDb.transaction(async (manager) => {
      const voucher = await this.findVoucherOrThrow(
        manager.connection,
        businessId,
        config,
        id,
      );
      this.assertEditable(voucher);
      this.applyUpdateFields(voucher, config, dto);

      const validationPayload = this.buildFullCreatePayload(
        voucher,
        config,
        dto,
      );

      await this.validateCreatePayload(
        manager,
        businessId,
        config,
        validationPayload,
      );

      return this.getRepo(manager, config.entity).save(voucher);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId,
      action: `${config.activityKey}_UPDATED`,
      description: `${config.activityKey} ${updated.voucherNumber} updated`,
      metadata: { voucherId: updated.id },
    });

    return updated;
  }

  async approve<T extends VoucherEntity>(
    tenantDb: DataSource,
    businessId: string,
    config: VoucherConfig<T>,
    id: string,
    userId: string,
  ) {
    const approved = await tenantDb.transaction(async (manager) => {
      const voucher = await this.findVoucherOrThrow(
        manager.connection,
        businessId,
        config,
        id,
      );

      if (voucher.status === VoucherStatus.PAID) {
        throw new BadRequestException('Voucher is already approved');
      }
      if (voucher.status === VoucherStatus.CANCELLED) {
        throw new BadRequestException('Cancelled vouchers cannot be approved');
      }

      const partyLedgerAccountId = config.hasParty
        ? await this.resolvePartyLedgerForVoucher(
            manager,
            businessId,
            config,
            voucher,
          )
        : undefined;

      if (config.referenceType === 'EXPENSE_VOUCHER') {
        await this.validateCreatePayload(manager, businessId, config, {
          voucherNumber: voucher.voucherNumber,
          paymentMethod: voucher.paymentMethod,
          paymentDate: voucher.paymentDate,
          paymentAmount: voucher.paymentAmount,
          expenseAccId: voucher.expenseAccId,
          accId: voucher.accId,
        });
      } else if (config.referenceType === 'CONTRA_VOUCHER') {
        await this.validateCreatePayload(manager, businessId, config, {
          voucherNumber: voucher.voucherNumber,
          paymentMethod: voucher.paymentMethod,
          paymentDate: voucher.paymentDate,
          paymentAmount: voucher.paymentAmount,
          fromAccId: voucher.fromAccId,
          toAccId: voucher.toAccId,
        });
      }

      voucher.status = VoucherStatus.PAID;
      const saved = await this.getRepo(manager, config.entity).save(voucher);
      await this.postApprovalJournal(
        manager,
        businessId,
        config,
        saved,
        partyLedgerAccountId,
      );
      return saved;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: userId,
      businessId,
      action: `${config.activityKey}_APPROVED`,
      description: `${config.activityKey} ${approved.voucherNumber} approved`,
      metadata: { voucherId: approved.id },
    });

    return approved;
  }
}
