import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import {
  ChartOfAccount,
  ChartOfAccountKind,
} from 'src/tenant-db/entities/chart-of-account.entity';
import { COA_PARENT_CODES } from 'src/tenant-db/chart-of-accounts/constants/coa-parent-codes';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { computeBalanceMovement } from 'src/tenant-db/helpers/transaction-balance.helper';
import { ActivityLogService } from './activity-log.service';

type BalanceRow = {
  chartOfAccountId: string;
  currentBalance: string | number | null;
};

type ReportAccountType = 'CASH' | 'BANK';

type PartyBalanceMode = 'CUSTOMER' | 'VENDOR';

@Injectable()
export class ReportService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private accountTypeFromParentCode(parentCode: string | null): ReportAccountType {
    return parentCode === COA_PARENT_CODES.BANK ? 'BANK' : 'CASH';
  }

  private async getLatestBalanceMap(
    tenantDb: DataSource,
    businessId: string,
    accountIds: string[],
  ): Promise<Map<string, number>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const rows = await tenantDb
      .getRepository(Transaction)
      .createQueryBuilder('tx')
      .distinctOn(['tx.chartOfAccountId'])
      .select('tx.chartOfAccountId', 'chartOfAccountId')
      .addSelect('tx.currentBalance', 'currentBalance')
      .where('tx.businessId = :businessId', { businessId })
      .andWhere('tx.chartOfAccountId IN (:...accountIds)', { accountIds })
      .orderBy('tx.chartOfAccountId', 'ASC')
      .addOrderBy('tx.transactionDate', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC')
      .addOrderBy('tx.id', 'DESC')
      .getRawMany<BalanceRow>();

    return new Map(
      rows.map((row) => [
        row.chartOfAccountId,
        this.roundAmount(Number(row.currentBalance ?? 0)),
      ]),
    );
  }

  private async getOpeningBalanceMap(
    tenantDb: DataSource,
    businessId: string,
    accounts: ChartOfAccount[],
  ): Promise<Map<string, number>> {
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return new Map();
    }

    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const openingTransactions = await tenantDb.getRepository(Transaction).find({
      where: {
        businessId,
        chartOfAccountId: In(accountIds),
        referenceType: AccountTransactionReferenceType.OPENING_BALANCE,
      },
      select: ['chartOfAccountId', 'debitAmount', 'creditAmount'],
    });

    const balances = new Map<string, number>();
    for (const tx of openingTransactions) {
      const account = accountById.get(tx.chartOfAccountId);
      if (!account) {
        continue;
      }
      const nature =
        account.accountKind === ChartOfAccountKind.PARTY_PAYABLE
          ? 'CREDIT'
          : 'DEBIT';
      const movement = computeBalanceMovement(
        nature,
        Number(tx.debitAmount ?? 0),
        Number(tx.creditAmount ?? 0),
      );
      const previous = balances.get(tx.chartOfAccountId) ?? 0;
      balances.set(tx.chartOfAccountId, this.roundAmount(previous + movement));
    }

    return balances;
  }

  private mapPartyBalance(
    party: Party,
    account: ChartOfAccount | null,
    openingBalance: number,
    currentBalance: number,
    mode: PartyBalanceMode,
  ) {
    return {
      id: party.id,
      name: party.name,
      accId: account?.id ?? null,
      accountCode: account?.code ?? null,
      code: party.code,
      address: party.address,
      openingBalance,
      currentBalance,
      partyType: party.type,
      balanceType: mode,
    };
  }

  async getCashAndBankBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const accounts = await tenantDb.getRepository(ChartOfAccount).find({
      where: {
        businessId: scopedBusinessId,
        accountKind: ChartOfAccountKind.BUSINESS,
        parentCode: In([COA_PARENT_CODES.CASH, COA_PARENT_CODES.BANK]),
        isPostable: true,
        deletedAt: IsNull(),
      },
      order: { parentCode: 'ASC', code: 'ASC' },
    });

    const accountIds = accounts.map((account) => account.id);
    const [latestBalances, openingBalances] = await Promise.all([
      this.getLatestBalanceMap(tenantDb, scopedBusinessId, accountIds),
      this.getOpeningBalanceMap(tenantDb, scopedBusinessId, accounts),
    ]);

    const data = accounts.map((account) => ({
      accId: account.id,
      accountName: account.name,
      accountCode: account.code,
      accountType: this.accountTypeFromParentCode(account.parentCode),
      openingBalance: openingBalances.get(account.id) ?? 0,
      currentBalance: latestBalances.get(account.id) ?? 0,
    }));

    const totals = data.reduce(
      (sum, account) => {
        if (account.accountType === 'CASH') {
          sum.cash = this.roundAmount(sum.cash + account.currentBalance);
        } else {
          sum.bank = this.roundAmount(sum.bank + account.currentBalance);
        }
        return sum;
      },
      { cash: 0, bank: 0 },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CASH_BANK_BALANCE_REPORT_VIEWED',
      description: 'Cash and bank balance report viewed',
      metadata: { count: data.length, totals },
    });

    return {
      data,
      totals,
      meta: { total: data.length },
    };
  }

  async getCustomerBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const parties = await tenantDb.getRepository(Party).find({
      where: {
        businessId: scopedBusinessId,
        type: In([PartyType.CUSTOMER, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      relations: { receivableAccount: true },
      order: { name: 'ASC' },
    });

    const accounts = parties
      .map((party) => party.receivableAccount)
      .filter((account): account is ChartOfAccount => Boolean(account));
    const accountIds = accounts.map((account) => account.id);
    const latestBalances = await this.getLatestBalanceMap(
      tenantDb,
      scopedBusinessId,
      accountIds,
    );

    const data = parties.map((party) =>
      this.mapPartyBalance(
        party,
        party.receivableAccount,
        Number(party.receivableOpeningBalance ?? 0),
        party.receivableAccountId
          ? latestBalances.get(party.receivableAccountId) ?? 0
          : 0,
        'CUSTOMER',
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CUSTOMER_BALANCE_REPORT_VIEWED',
      description: 'Customer balance report viewed',
      metadata: { count: data.length },
    });

    return {
      data,
      totals: {
        currentBalance: this.roundAmount(
          data.reduce((sum, party) => sum + party.currentBalance, 0),
        ),
      },
      meta: { total: data.length },
    };
  }

  async getVendorBalances(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const parties = await tenantDb.getRepository(Party).find({
      where: {
        businessId: scopedBusinessId,
        type: In([PartyType.VENDOR, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      relations: { payableAccount: true },
      order: { name: 'ASC' },
    });

    const accounts = parties
      .map((party) => party.payableAccount)
      .filter((account): account is ChartOfAccount => Boolean(account));
    const accountIds = accounts.map((account) => account.id);
    const latestBalances = await this.getLatestBalanceMap(
      tenantDb,
      scopedBusinessId,
      accountIds,
    );

    const data = parties.map((party) =>
      this.mapPartyBalance(
        party,
        party.payableAccount,
        Number(party.payableOpeningBalance ?? 0),
        party.payableAccountId ? latestBalances.get(party.payableAccountId) ?? 0 : 0,
        'VENDOR',
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'VENDOR_BALANCE_REPORT_VIEWED',
      description: 'Vendor balance report viewed',
      metadata: { count: data.length },
    });

    return {
      data,
      totals: {
        currentBalance: this.roundAmount(
          data.reduce((sum, party) => sum + party.currentBalance, 0),
        ),
      },
      meta: { total: data.length },
    };
  }
}
