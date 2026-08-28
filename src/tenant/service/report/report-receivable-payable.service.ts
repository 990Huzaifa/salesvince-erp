import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  getBalancesAsOfMap,
  getPeriodMovementsByAccount,
} from './report-account-balance.helper';
import {
  assertBusinessId,
  endOfDay,
  paginateItems,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type PartyLedgerMode = 'CUSTOMER' | 'VENDOR';

type PartyLedgerReportOptions = {
  startDate?: string;
  endDate?: string;
  partyId?: string;
  page?: number;
  limit?: number;
};

type PartyLedgerTotals = {
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
};

@Injectable()
export class ReportReceivablePayableService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getReceivableReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: PartyLedgerReportOptions,
    actorUserId: string,
  ) {
    return this.getPartyLedgerReport(
      tenantDb,
      businessId,
      'CUSTOMER',
      options,
      actorUserId,
      'RECEIVABLE_REPORT_VIEWED',
      'Receivable report viewed',
    );
  }

  async getPayableReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: PartyLedgerReportOptions,
    actorUserId: string,
  ) {
    return this.getPartyLedgerReport(
      tenantDb,
      businessId,
      'VENDOR',
      options,
      actorUserId,
      'PAYABLE_REPORT_VIEWED',
      'Payable report viewed',
    );
  }

  private async getPartyLedgerReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    mode: PartyLedgerMode,
    options: PartyLedgerReportOptions,
    actorUserId: string,
    activityAction: string,
    activityDescription: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );
    const partyId = options.partyId?.trim() || undefined;
    const partyTypes =
      mode === 'CUSTOMER'
        ? [PartyType.CUSTOMER, PartyType.BOTH]
        : [PartyType.VENDOR, PartyType.BOTH];

    if (partyId) {
      await this.assertParty(tenantDb, scopedBusinessId, partyId, partyTypes);
    }

    const where: Record<string, unknown> = {
      businessId: scopedBusinessId,
      type: In(partyTypes),
      deletedAt: IsNull(),
    };
    if (partyId) {
      where.id = partyId;
    }

    const accountRelation =
      mode === 'CUSTOMER' ? 'receivableAccount' : 'payableAccount';

    const parties = await tenantDb.getRepository(Party).find({
      where,
      relations: { [accountRelation]: true },
      order: { name: 'ASC' },
    });

    const accounts = parties
      .map((party) =>
        mode === 'CUSTOMER' ? party.receivableAccount : party.payableAccount,
      )
      .filter((account): account is ChartOfAccount => Boolean(account));

    const accountIds = accounts.map((account) => account.id);
    const hasDateFilter = Boolean(startDate || endDate);
    const periodStart = startDate ?? startOfDay(new Date(0));
    const periodEnd = endDate ?? endOfDay(new Date());

    const [ledgerOpeningBalances, ledgerClosingBalances, periodMovements] =
      await Promise.all([
        startDate
          ? getBalancesAsOfMap(
              tenantDb,
              scopedBusinessId,
              accounts,
              this.dayBefore(startDate),
            )
          : Promise.resolve(new Map<string, number>()),
        hasDateFilter
          ? getBalancesAsOfMap(
              tenantDb,
              scopedBusinessId,
              accounts,
              periodEnd,
            )
          : getBalancesAsOfMap(
              tenantDb,
              scopedBusinessId,
              accounts,
              endOfDay(new Date()),
            ),
        hasDateFilter
          ? getPeriodMovementsByAccount(
              tenantDb,
              scopedBusinessId,
              accountIds,
              periodStart,
              periodEnd,
            )
          : Promise.resolve(
              new Map<string, { debit: number; credit: number }>(),
            ),
      ]);

    const allData = parties.map((party) => {
      const account =
        mode === 'CUSTOMER' ? party.receivableAccount : party.payableAccount;
      const accountId =
        mode === 'CUSTOMER' ? party.receivableAccountId : party.payableAccountId;
      const staticOpening =
        mode === 'CUSTOMER'
          ? Number(party.receivableOpeningBalance ?? 0)
          : Number(party.payableOpeningBalance ?? 0);
      const movement = accountId
        ? (periodMovements.get(accountId) ?? { debit: 0, credit: 0 })
        : { debit: 0, credit: 0 };

      const openingBalance = startDate
        ? accountId
          ? (ledgerOpeningBalances.get(accountId) ?? 0)
          : 0
        : staticOpening;
      const closingBalance = accountId
        ? (ledgerClosingBalances.get(accountId) ?? 0)
        : 0;

      return {
        id: party.id,
        name: party.name,
        accId: account?.id ?? null,
        accountCode: account?.code ?? null,
        code: party.code,
        address: party.address,
        openingBalance,
        periodDebit: movement.debit,
        periodCredit: movement.credit,
        closingBalance,
        partyType: party.type,
        balanceType: mode,
      };
    });

    const totals = allData.reduce<PartyLedgerTotals>(
      (sum, row) => {
        sum.openingBalance = roundAmount(sum.openingBalance + row.openingBalance);
        sum.periodDebit = roundAmount(sum.periodDebit + row.periodDebit);
        sum.periodCredit = roundAmount(sum.periodCredit + row.periodCredit);
        sum.closingBalance = roundAmount(sum.closingBalance + row.closingBalance);
        return sum;
      },
      {
        openingBalance: 0,
        periodDebit: 0,
        periodCredit: 0,
        closingBalance: 0,
      },
    );

    const { items: data, meta } = paginateItems(
      allData,
      options.page,
      options.limit,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: activityAction,
      description: activityDescription,
      metadata: {
        count: meta.total,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        partyId: partyId ?? null,
        totals,
      },
    });

    return {
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      data,
      totals,
      meta,
    };
  }

  private async assertParty(
    tenantDb: DataSource,
    businessId: string,
    partyId: string,
    allowedTypes: PartyType[],
  ): Promise<Party> {
    const party = await tenantDb.getRepository(Party).findOne({
      where: {
        id: partyId,
        businessId,
        deletedAt: IsNull(),
      },
    });

    if (!party) {
      throw new BadRequestException('Party not found');
    }

    if (!allowedTypes.includes(party.type)) {
      throw new BadRequestException('Party type is not valid for this report');
    }

    return party;
  }

  private dayBefore(date: Date): Date {
    const prior = new Date(date);
    prior.setDate(prior.getDate() - 1);
    return endOfDay(prior);
  }
}
