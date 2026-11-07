import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import * as XLSX from 'xlsx';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from 'src/tenant-db/entities/chart-of-account.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  computeBalanceMovement,
  getAccountBalanceNature,
} from 'src/tenant-db/helpers/transaction-balance.helper';
import { recalculateAccountLedgerBalances } from 'src/tenant-db/helpers/ledger-balance-recalculation.helper';
import { ActivityLogService } from './activity-log.service';
import { TenantJobService } from './tenant-job.service';

export type JournalLineInput = {
  chartOfAccountId: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
};

export type PostJournalParams = {
  businessId: string;
  referenceType: AccountTransactionReferenceType;
  referenceId?: string | null;
  partyId?: string | null;
  transactionDate?: Date;
  description?: string;
  lines: JournalLineInput[];
};

export type PartyOpeningBalanceInput = {
  businessId: string;
  party: Party;
  receivableOpeningBalance?: number;
  payableOpeningBalance?: number;
  transactionDate?: Date;
};

export type BusinessAccountOpeningBalanceInput = {
  businessId: string;
  account: ChartOfAccount;
  openingBalance?: number;
  transactionDate?: Date;
};

type CustomerOpeningBalanceImportRow = {
  row: number;
  name: string;
  amount: number;
};

@Injectable()
export class TransactionService {

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly tenantJobService: TenantJobService,
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

  private isEffectivelyZero(value: number): boolean {
    return Math.abs(this.roundAmount(value)) < 0.005;
  }

  validateJournalLines(lines: JournalLineInput[]): void {
    if (!lines.length) {
      throw new BadRequestException('Journal must have at least one line');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const [index, line] of lines.entries()) {
      const debit = line.debitAmount ?? 0;
      const credit = line.creditAmount ?? 0;
      const hasDebit = !this.isEffectivelyZero(debit);
      const hasCredit = !this.isEffectivelyZero(credit);

      if (hasDebit && hasCredit) {
        throw new BadRequestException(
          `Journal line ${index + 1}: cannot have both debit and credit`,
        );
      }
      if (!hasDebit && !hasCredit) {
        throw new BadRequestException(
          `Journal line ${index + 1}: debit or credit amount is required`,
        );
      }
      if (debit < 0 || credit < 0) {
        throw new BadRequestException(
          `Journal line ${index + 1}: amounts cannot be negative`,
        );
      }

      totalDebit += hasDebit ? this.roundAmount(debit) : 0;
      totalCredit += hasCredit ? this.roundAmount(credit) : 0;
    }

    if (this.roundAmount(totalDebit) !== this.roundAmount(totalCredit)) {
      throw new BadRequestException(
        `Journal is not balanced (debit ${totalDebit} ≠ credit ${totalCredit})`,
      );
    }
  }

  private async resolvePostableAccount(
    manager: EntityManager,
    businessId: string,
    chartOfAccountId: string,
  ): Promise<ChartOfAccount> {
    const account = await manager.getRepository(ChartOfAccount).findOne({
      where: { id: chartOfAccountId, businessId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `Account ${account.code} is not postable`,
      );
    }
    return account;
  }

  /** Last stored running balance for a COA (0 if no prior entries). */
  private async getLastCurrentBalance(
    manager: EntityManager,
    businessId: string,
    chartOfAccountId: string,
  ): Promise<number> {
    const last = await manager.getRepository(Transaction).findOne({
      where: { businessId, chartOfAccountId },
      order: { createdAt: 'DESC', id: 'DESC' },
      select: ['currentBalance'],
    });
    return last ? this.roundAmount(Number(last.currentBalance)) : 0;
  }

  private resolveCurrentBalance(
    account: ChartOfAccount,
    previousBalance: number,
    debitAmount: number | null,
    creditAmount: number | null,
  ): number {
    const nature = getAccountBalanceNature(account);
    const movement = computeBalanceMovement(
      nature,
      debitAmount ?? 0,
      creditAmount ?? 0,
    );
    return this.roundAmount(previousBalance + movement);
  }

  private async recalculateAfterPost(
    manager: EntityManager,
    businessId: string,
    account: ChartOfAccount,
  ): Promise<void> {
    await recalculateAccountLedgerBalances(manager, {
      businessId,
      account,
      chartOfAccountId: account.id,
    });
  }

  private async saveLedgerEntry(
    manager: EntityManager,
    params: {
      businessId: string;
      account: ChartOfAccount;
      referenceType: AccountTransactionReferenceType;
      referenceId?: string | null;
      partyId?: string | null;
      transactionDate?: Date;
      description?: string | null;
      debitAmount: number | null;
      creditAmount: number | null;
      previousBalance?: number;
      skipRecalc?: boolean;
    },
  ): Promise<Transaction> {
    const previousBalance =
      params.previousBalance ??
      (await this.getLastCurrentBalance(
        manager,
        params.businessId,
        params.account.id,
      ));

    const currentBalance = this.resolveCurrentBalance(
      params.account,
      previousBalance,
      params.debitAmount,
      params.creditAmount,
    );

    const txRepo = manager.getRepository(Transaction);
    const saved = await txRepo.save(
      txRepo.create({
        businessId: params.businessId,
        chartOfAccountId: params.account.id,
        referenceType: params.referenceType,
        referenceId: params.referenceId ?? null,
        transactionDate: params.transactionDate ?? new Date(),
        description: params.description ?? null,
        debitAmount: params.debitAmount,
        creditAmount: params.creditAmount,
        currentBalance,
      }),
    );

    if (!params.skipRecalc) {
      await this.recalculateAfterPost(
        manager,
        params.businessId,
        params.account,
      );
      const refreshed = await txRepo.findOne({ where: { id: saved.id } });
      return refreshed ?? saved;
    }

    return saved;
  }

  async postDirectLedgerEntry(
    manager: EntityManager,
    params: {
      businessId: string;
      chartOfAccountId: string;
      referenceType: AccountTransactionReferenceType;
      referenceId?: string | null;
      partyId?: string | null;
      transactionDate?: Date;
      description?: string;
      debitAmount?: number;
      creditAmount?: number;
    },
  ): Promise<Transaction> {
    const debit = params.debitAmount ?? 0;
    const credit = params.creditAmount ?? 0;
    const hasDebit = !this.isEffectivelyZero(debit);
    const hasCredit = !this.isEffectivelyZero(credit);

    if (hasDebit && hasCredit) {
      throw new BadRequestException('Entry cannot have both debit and credit');
    }
    if (!hasDebit && !hasCredit) {
      throw new BadRequestException('Entry requires a debit or credit amount');
    }
    if (debit < 0 || credit < 0) {
      throw new BadRequestException('Amounts cannot be negative');
    }

    const account = await this.resolvePostableAccount(
      manager,
      params.businessId,
      params.chartOfAccountId,
    );

    return this.saveLedgerEntry(manager, {
      businessId: params.businessId,
      account,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      partyId: params.partyId,
      transactionDate: params.transactionDate,
      description: params.description,
      debitAmount: hasDebit ? this.roundAmount(debit) : null,
      creditAmount: hasCredit ? this.roundAmount(credit) : null,
    });
  }

  /**
   * Updates the single direct ledger entry for a reference (e.g. GRN payable credit).
   * Recalculates running balances on the affected COA afterward.
   */
  async updateDirectLedgerEntryByReference(
    manager: EntityManager,
    params: {
      businessId: string;
      chartOfAccountId: string;
      referenceType: AccountTransactionReferenceType;
      referenceId: string;
      transactionDate?: Date;
      description?: string;
      debitAmount?: number;
      creditAmount?: number;
    },
  ): Promise<Transaction> {
    const debit = params.debitAmount ?? 0;
    const credit = params.creditAmount ?? 0;
    const hasDebit = !this.isEffectivelyZero(debit);
    const hasCredit = !this.isEffectivelyZero(credit);

    if (hasDebit && hasCredit) {
      throw new BadRequestException('Entry cannot have both debit and credit');
    }
    if (!hasDebit && !hasCredit) {
      throw new BadRequestException('Entry requires a debit or credit amount');
    }
    if (debit < 0 || credit < 0) {
      throw new BadRequestException('Amounts cannot be negative');
    }

    const txRepo = manager.getRepository(Transaction);
    let existing = await txRepo.findOne({
      where: {
        businessId: params.businessId,
        chartOfAccountId: params.chartOfAccountId,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    if (!existing) {
      existing = await txRepo.findOne({
        where: {
          businessId: params.businessId,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
        },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    }

    if (!existing) {
      throw new NotFoundException(
        `Ledger entry not found for ${params.referenceType} ${params.referenceId}`,
      );
    }

    const account = await this.resolvePostableAccount(
      manager,
      params.businessId,
      existing.chartOfAccountId,
    );

    await txRepo.update(existing.id, {
      transactionDate: params.transactionDate ?? existing.transactionDate,
      description:
        params.description !== undefined
          ? params.description ?? null
          : existing.description,
      debitAmount: hasDebit ? this.roundAmount(debit) : null,
      creditAmount: hasCredit ? this.roundAmount(credit) : null,
    });

    await this.recalculateAfterPost(manager, params.businessId, account);

    const refreshed = await txRepo.findOne({ where: { id: existing.id } });
    return refreshed ?? existing;
  }

  async postJournal(
    manager: EntityManager,
    params: PostJournalParams,
  ): Promise<Transaction[]> {
    this.validateJournalLines(params.lines);

    const transactionDate = params.transactionDate ?? new Date();
    const saved: Transaction[] = [];
    /** Running balance per COA within this journal batch (same account twice in one voucher). */
    const batchBalances = new Map<string, number>();
    const affectedAccounts = new Map<string, ChartOfAccount>();

    for (const line of params.lines) {
      const account = await this.resolvePostableAccount(
        manager,
        params.businessId,
        line.chartOfAccountId,
      );
      affectedAccounts.set(account.id, account);

      const debit = line.debitAmount ?? 0;
      const credit = line.creditAmount ?? 0;
      const hasDebit = !this.isEffectivelyZero(debit);

      const previousBalance =
        batchBalances.get(account.id) ??
        (await this.getLastCurrentBalance(
          manager,
          params.businessId,
          account.id,
        ));

      const entry = await this.saveLedgerEntry(manager, {
        businessId: params.businessId,
        account,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        partyId: params.partyId,
        transactionDate,
        description: line.description ?? params.description ?? null,
        debitAmount: hasDebit ? this.roundAmount(debit) : null,
        creditAmount: hasDebit ? null : this.roundAmount(credit),
        previousBalance,
        skipRecalc: true,
      });

      batchBalances.set(
        account.id,
        this.roundAmount(Number(entry.currentBalance)),
      );
      saved.push(entry);
    }

    for (const account of affectedAccounts.values()) {
      await this.recalculateAfterPost(manager, params.businessId, account);
    }

    if (saved.length === 0) {
      return saved;
    }

    const txRepo = manager.getRepository(Transaction);
    const refreshed = await txRepo.find({
      where: { id: In(saved.map((entry) => entry.id)) },
    });
    const byId = new Map(refreshed.map((entry) => [entry.id, entry]));
    return saved.map((entry) => byId.get(entry.id) ?? entry);
  }

  async postPartyOpeningBalances(
    manager: EntityManager,
    input: PartyOpeningBalanceInput,
  ): Promise<Transaction[]> {
    const receivable = input.receivableOpeningBalance ?? 0;
    const payable = input.payableOpeningBalance ?? 0;

    if (this.isEffectivelyZero(receivable) && this.isEffectivelyZero(payable)) {
      return [];
    }

    const saved: Transaction[] = [];
    const base = {
      businessId: input.businessId,
      referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
      referenceId: input.party.id,
      partyId: input.party.id,
      transactionDate: input.transactionDate,
    };

    if (!this.isEffectivelyZero(receivable)) {
      if (!input.party.receivableAccountId) {
        throw new BadRequestException(
          'Receivable account is required for receivable opening balance',
        );
      }
      if (input.party.type === PartyType.VENDOR) {
        throw new BadRequestException(
          'Receivable opening balance is not allowed for VENDOR parties',
        );
      }

      const abs = this.roundAmount(Math.abs(receivable));
      const narration = `Opening receivable - ${input.party.name}`;

      saved.push(
        await this.postDirectLedgerEntry(manager, {
          ...base,
          chartOfAccountId: input.party.receivableAccountId,
          description: narration,
          ...(receivable > 0
            ? { debitAmount: abs }
            : { creditAmount: abs }),
        }),
      );
    }

    if (!this.isEffectivelyZero(payable)) {
      if (!input.party.payableAccountId) {
        throw new BadRequestException(
          'Payable account is required for payable opening balance',
        );
      }
      if (input.party.type === PartyType.CUSTOMER) {
        throw new BadRequestException(
          'Payable opening balance is not allowed for CUSTOMER parties',
        );
      }

      const abs = this.roundAmount(Math.abs(payable));
      const narration = `Opening payable - ${input.party.name}`;

      saved.push(
        await this.postDirectLedgerEntry(manager, {
          ...base,
          chartOfAccountId: input.party.payableAccountId,
          description: narration,
          ...(payable > 0
            ? { creditAmount: abs }
            : { debitAmount: abs }),
        }),
      );
    }

    return saved;
  }

  async postBusinessAccountOpeningBalance(
    manager: EntityManager,
    input: BusinessAccountOpeningBalanceInput,
  ): Promise<Transaction | null> {
    const openingBalance = input.openingBalance ?? 0;
    if (this.isEffectivelyZero(openingBalance)) {
      return null;
    }

    const abs = this.roundAmount(Math.abs(openingBalance));
    const nature = getAccountBalanceNature(input.account);
    const narration = `Opening balance - ${input.account.name}`;
    const isPositive = openingBalance > 0;

    const debitCredit =
      nature === 'DEBIT'
        ? isPositive
          ? { debitAmount: abs }
          : { creditAmount: abs }
        : isPositive
          ? { creditAmount: abs }
          : { debitAmount: abs };

    return this.postDirectLedgerEntry(manager, {
      businessId: input.businessId,
      chartOfAccountId: input.account.id,
      referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
      referenceId: input.account.id,
      transactionDate: input.transactionDate,
      description: narration,
      ...debitCredit,
    });
  }

  /**
   * Posts an OPENING_BALANCE ledger entry for an existing COA that has
   * no transactions yet. Debit vs credit is derived from account nature.
   */
  async createOpeningBalanceForAccount(
    tenantDb: DataSource,
    businessId: string | undefined,
    input: {
      chartOfAccountId: string;
      amount: number;
      transactionDate?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const amount = this.roundAmount(Number(input.amount));

    if (!Number.isFinite(amount) || this.isEffectivelyZero(amount)) {
      throw new BadRequestException('amount must be a non-zero number');
    }

    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: {
        id: input.chartOfAccountId,
        businessId: scopedBusinessId,
        deletedAt: IsNull(),
      },
    });

    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }

    if (!account.isPostable) {
      throw new BadRequestException(
        'Opening balance can only be posted to a postable chart of account',
      );
    }

    const existingCount = await tenantDb.getRepository(Transaction).count({
      where: {
        businessId: scopedBusinessId,
        chartOfAccountId: account.id,
      },
    });

    if (existingCount > 0) {
      throw new BadRequestException(
        'Opening balance can only be applied to an account with no existing transactions',
      );
    }

    const nature = getAccountBalanceNature(account);
    const transactionDate = input.transactionDate
      ? new Date(input.transactionDate)
      : undefined;

    const saved = await tenantDb.transaction(async (manager) =>
      this.postBusinessAccountOpeningBalance(manager, {
        businessId: scopedBusinessId,
        account,
        openingBalance: amount,
        transactionDate,
      }),
    );

    if (!saved) {
      throw new BadRequestException('Failed to create opening balance transaction');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'COA_OPENING_BALANCE_CREATED',
      description: `Opening balance posted for ${account.code} - ${account.name}`,
      metadata: {
        chartOfAccountId: account.id,
        code: account.code,
        amount,
        nature,
        transactionId: saved.id,
        debitAmount: saved.debitAmount,
        creditAmount: saved.creditAmount,
      },
    });

    return {
      data: {
        id: saved.id,
        chartOfAccountId: account.id,
        chartOfAccount: {
          id: account.id,
          code: account.code,
          name: account.name,
          accountKind: account.accountKind,
        },
        referenceType: saved.referenceType,
        transactionDate: saved.transactionDate,
        description: saved.description,
        amount: Math.abs(amount),
        nature,
        side: saved.debitAmount != null ? 'DEBIT' : 'CREDIT',
        debitAmount: saved.debitAmount,
        creditAmount: saved.creditAmount,
        currentBalance: saved.currentBalance,
        createdAt: saved.createdAt,
      },
    };
  }

  /**
   * CSV/XLS import: match customer / receivable COA by exact name and post
   * opening balances (Closing Balance column treated as opening receivable).
   */
  async importCustomerOpeningBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    file: Express.Multer.File,
    actorUserId: string,
    tenantCode: string,
    transactionDate?: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseCustomerOpeningBalanceRows(file);
    if (!rows.length) {
      throw new BadRequestException(
        'No rows found. Expected columns: NAME, Opening balance',
      );
    }

    const parsedDate = transactionDate ? new Date(transactionDate) : undefined;
    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('transactionDate must be a valid date');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: scopedBusinessId,
      jobType: 'CUSTOMER_OPENING_BALANCE_IMPORT',
      fileName: file.originalname || 'customer-opening-balances.csv',
      createdBy: actorUserId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_STARTED',
      description: `Customer opening balance import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processCustomerOpeningBalanceImportJob(
      tenantDb,
      job.id,
      rows,
      scopedBusinessId,
      actorUserId,
      tenantCode,
      parsedDate,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing failure',
      });
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: actorUserId,
        businessId: scopedBusinessId,
        action: 'TENANT_JOB_FAILED',
        description: `Customer opening balance import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    });

    return {
      message: 'Customer opening balance import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }

  private parseCustomerOpeningBalanceRows(
    file: Express.Multer.File,
  ): CustomerOpeningBalanceImportRow[] {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const rows: CustomerOpeningBalanceImportRow[] = [];
    rawRows.forEach((raw, index) => {
      const name = this.sanitizeImportText(
        this.getImportRowValue(
          raw,
          'NAME',
          'Customer Name',
          'customerName',
          'customer_name',
          'name',
          'partyName',
          'party_name',
        ),
      );
      const normalizedName = name.toLowerCase();
      if (
        !name ||
        normalizedName === 'customer name' ||
        normalizedName === 'name'
      ) {
        return;
      }

      const amountRaw = this.getImportRowValue(
        raw,
        'Opening balance',
        'Openinhg balance',
        'openingBalance',
        'opening_balance',
        'Closing Balance',
        'closingBalance',
        'closing_balance',
        'Balance',
        'balance',
        'Amount',
        'amount',
      );
      const amount = this.parseImportAmount(amountRaw);
      if (amount == null) {
        rows.push({ row: index + 2, name, amount: Number.NaN });
        return;
      }

      rows.push({ row: index + 2, name, amount });
    });

    return rows;
  }

  private getImportRowValue(
    row: Record<string, unknown>,
    ...keys: string[]
  ): unknown {
    const entries = Object.entries(row);
    for (const key of keys) {
      const normalized = key.replace(/[\s_]+/g, '').toLowerCase();
      const match = entries.find(
        ([candidate]) =>
          candidate.replace(/[\s_]+/g, '').toLowerCase() === normalized,
      );
      if (match) return match[1];
    }
    return undefined;
  }

  private sanitizeImportText(value: unknown): string {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseImportAmount(value: unknown): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const normalized = String(value)
      .replace(/,/g, '')
      .replace(/[^\d.\-]/g, '')
      .trim();
    if (!normalized || normalized === '-' || normalized === '.') return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  private async processCustomerOpeningBalanceImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: CustomerOpeningBalanceImportRow[],
    businessId: string,
    actorUserId: string,
    tenantCode: string,
    transactionDate?: Date,
  ) {
    this.tenantJobService.startJob(jobId);
    const partyRepo = tenantDb.getRepository(Party);
    const coaRepo = tenantDb.getRepository(ChartOfAccount);
    const txRepo = tenantDb.getRepository(Transaction);

    for (const row of rows) {
      try {
        if (!Number.isFinite(row.amount)) {
          throw new BadRequestException('Invalid closing/opening balance amount');
        }
        if (this.isEffectivelyZero(row.amount)) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'success',
            metadata: { skipped: true, reason: 'zero_amount' },
          });
          continue;
        }

        const parties = await partyRepo.find({
          where: [
            {
              businessId,
              name: row.name,
              type: PartyType.CUSTOMER,
              deletedAt: IsNull(),
            },
            {
              businessId,
              name: row.name,
              type: PartyType.BOTH,
              deletedAt: IsNull(),
            },
          ],
        });
        if (parties.length > 1) {
          throw new BadRequestException(
            `Multiple customers found with exact name "${row.name}"`,
          );
        }

        let party = parties[0] ?? null;
        let account: ChartOfAccount | null = null;

        if (party?.receivableAccountId) {
          account = await coaRepo.findOne({
            where: {
              id: party.receivableAccountId,
              businessId,
              deletedAt: IsNull(),
            },
          });
        }

        if (!account) {
          const exactAccounts = await coaRepo.find({
            where: [
              {
                businessId,
                name: row.name,
                isPostable: true,
                deletedAt: IsNull(),
              },
              {
                businessId,
                name: `${row.name} - Receivable`,
                isPostable: true,
                deletedAt: IsNull(),
              },
            ],
          });
          const receivablePreferred =
            exactAccounts.find(
              (item) => item.accountKind === ChartOfAccountKind.PARTY_RECEIVABLE,
            ) || exactAccounts[0];
          account = receivablePreferred ?? null;

          if (account?.partyId && !party) {
            party = await partyRepo.findOne({
              where: {
                id: account.partyId,
                businessId,
                deletedAt: IsNull(),
              },
            });
          }
        }

        if (!account) {
          throw new NotFoundException(
            `No customer/COA found with exact name "${row.name}"`,
          );
        }
        if (!account.isPostable) {
          throw new BadRequestException(
            `COA "${account.name}" is not postable`,
          );
        }

        // Re-import safe: only create OPENING_BALANCE when it is still missing.
        const existingOpeningCount = await txRepo.count({
          where: {
            businessId,
            chartOfAccountId: account.id,
            referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
          },
        });
        if (existingOpeningCount > 0) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.name,
            status: 'success',
            metadata: {
              skipped: true,
              reason: 'opening_balance_already_exists',
              chartOfAccountId: account.id,
              chartOfAccountCode: account.code,
              partyId: party?.id ?? null,
            },
          });
          continue;
        }

        const amount = this.roundAmount(row.amount);

        await tenantDb.transaction(async (manager) => {
          if (party) {
            if (!party.receivableAccountId) {
              party.receivableAccountId = account!.id;
            }
            party.receivableOpeningBalance = amount;
            await manager.getRepository(Party).save(party);
            await this.postPartyOpeningBalances(manager, {
              businessId,
              party: {
                ...party,
                receivableAccountId: account!.id,
              } as Party,
              receivableOpeningBalance: amount,
              transactionDate,
            });
            return;
          }

          await this.postBusinessAccountOpeningBalance(manager, {
            businessId,
            account: account!,
            openingBalance: amount,
            transactionDate,
          });
        });

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'success',
          metadata: {
            chartOfAccountId: account.id,
            chartOfAccountCode: account.code,
            chartOfAccountName: account.name,
            partyId: party?.id ?? null,
            amount,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.tenantJobService.completeJob(jobId);
    const completedJob = this.tenantJobService.getJobById(
      jobId,
      tenantCode,
      actorUserId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Customer opening balance import completed (${completedJob.inserted} ok, ${completedJob.failed} failed)`,
      metadata: {
        jobId,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        totalRows: completedJob.totalRows,
      },
    });
  }

  async listTransactions(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
    },
    actorUserId: string,
  ){
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    // join with chart of account to get the account name
    const qb = tenantDb.getRepository(Transaction).createQueryBuilder('t')
    .leftJoinAndSelect('t.chartOfAccount', 'coa');
    qb.where('t.businessId = :businessId', { businessId: scopedBusinessId })
    qb.orderBy('t.transactionDate', 'DESC')
    .addOrderBy('t.createdAt', 'DESC')
    .addOrderBy('t.id', 'DESC')
    .skip(skip)
    .take(limit);

    if (options.search?.trim()) {
      qb.andWhere('coa.name ILIKE :search', { search: `%${options.search.trim()}%` });
    }

    const [transactions, total] = await qb.getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: businessId,
      action: 'TRANSACTION_LISTED',
      description: 'Transactions listed',
      metadata: { businessId: scopedBusinessId, count: transactions.length },
    });
      return {
      data: transactions,
      meta: { total, page, limit },
    };
  }

  /**
   * Removes all ledger rows for a reference and recomputes running balances
   * on every chart of account that had entries for that reference.
   */
  async deleteLedgerEntriesByReference(
    manager: EntityManager,
    params: {
      businessId: string;
      referenceType: AccountTransactionReferenceType;
      referenceId: string;
    },
  ): Promise<{ deletedCount: number; affectedAccountIds: string[] }> {
    const txRepo = manager.getRepository(Transaction);
    const entries = await txRepo.find({
      where: {
        businessId: params.businessId,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
      },
      select: ['id', 'chartOfAccountId'],
    });

    if (!entries.length) {
      return { deletedCount: 0, affectedAccountIds: [] };
    }

    const affectedAccountIds = [
      ...new Set(entries.map((entry) => entry.chartOfAccountId)),
    ];

    await txRepo.delete({ id: In(entries.map((entry) => entry.id)) });

    for (const chartOfAccountId of affectedAccountIds) {
      const account = await manager.getRepository(ChartOfAccount).findOne({
        where: {
          id: chartOfAccountId,
          businessId: params.businessId,
          deletedAt: IsNull(),
        },
      });
      if (!account) {
        continue;
      }

      await recalculateAccountLedgerBalances(manager, {
        businessId: params.businessId,
        account,
        chartOfAccountId,
      });
    }

    return { deletedCount: entries.length, affectedAccountIds };
  }

  async recalculateBusinessLedgers(
    tenantDb: DataSource,
    businessId: string | undefined,
    chartOfAccountId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const results = await tenantDb.transaction(async (manager) => {
      const accountIds = chartOfAccountId
        ? [chartOfAccountId]
        : (
            await manager
              .getRepository(Transaction)
              .createQueryBuilder('t')
              .select('DISTINCT t.chartOfAccountId', 'chartOfAccountId')
              .where('t.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .getRawMany<{ chartOfAccountId: string }>()
          ).map((row) => row.chartOfAccountId);

      const recalculated: Array<{
        chartOfAccountId: string;
        updatedCount: number;
        closingBalance: number;
      }> = [];

      for (const coaId of accountIds) {
        const account = await manager.getRepository(ChartOfAccount).findOne({
          where: {
            id: coaId,
            businessId: scopedBusinessId,
            deletedAt: IsNull(),
          },
        });
        if (!account) {
          continue;
        }

        const result = await recalculateAccountLedgerBalances(manager, {
          businessId: scopedBusinessId,
          account,
          chartOfAccountId: coaId,
        });

        recalculated.push({
          chartOfAccountId: coaId,
          updatedCount: result.updatedCount,
          closingBalance: result.closingBalance,
        });
      }

      return recalculated;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'LEDGER_RECALCULATED',
      description: `Ledger balances recalculated for ${results.length} account(s)`,
      metadata: {
        chartOfAccountId: chartOfAccountId ?? null,
        accountsRecalculated: results.length,
      },
    });

    return {
      accountsRecalculated: results.length,
      results,
    };
  }
}
