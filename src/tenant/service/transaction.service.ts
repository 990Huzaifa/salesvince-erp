import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  computeBalanceMovement,
  getAccountBalanceNature,
} from 'src/tenant-db/helpers/transaction-balance.helper';

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

@Injectable()
export class TransactionService {
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
    return txRepo.save(
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

  async postJournal(
    manager: EntityManager,
    params: PostJournalParams,
  ): Promise<Transaction[]> {
    this.validateJournalLines(params.lines);

    const transactionDate = params.transactionDate ?? new Date();
    const saved: Transaction[] = [];
    /** Running balance per COA within this journal batch (same account twice in one voucher). */
    const batchBalances = new Map<string, number>();

    for (const line of params.lines) {
      const account = await this.resolvePostableAccount(
        manager,
        params.businessId,
        line.chartOfAccountId,
      );

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
      });

      batchBalances.set(
        account.id,
        this.roundAmount(Number(entry.currentBalance)),
      );
      saved.push(entry);
    }

    return saved;
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
}
