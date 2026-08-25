import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Party } from 'src/tenant-db/entities/party.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { MasterGeoHelperService } from '../master-geo-helper.service';
import { ReportService } from '../report.service';
import {
  assertBusinessId,
  paginateItems,
  roundAmount,
} from './report-query.helper';

type CustomerBalanceRow = {
  id: string;
  name: string;
  currentBalance: number;
};

export type CustomerLowPaymentOptions = {
  search?: string;
  cityId?: string;
  minBalance?: number;
  maxBalance?: number;
  minLastPaymentDays?: number;
  maxLastPaymentDays?: number;
  page?: number;
  limit?: number;
};

type CustomerLowPaymentRow = {
  name: string;
  cityName: string | null;
  balance: string;
  lastPaymentAmount: string;
  lastPaymentDays: number | '-';
};

@Injectable()
export class ReportCustomerLowPaymentService {
  constructor(
    private readonly reportService: ReportService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async getLowPaymentCustomers(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
    options: CustomerLowPaymentOptions = {},
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const customerBalances = await this.reportService.getCustomerBalances(
      tenantDb,
      scopedBusinessId,
      actorUserId,
    );

    const allData = await this.buildLowPaymentCustomers(
      tenantDb,
      scopedBusinessId,
      customerBalances.data,
      options,
    );

    const { items: data, meta } = paginateItems(
      allData,
      options.page,
      options.limit,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CUSTOMER_LOW_PAYMENT_REPORT_VIEWED',
      description: 'Customer low payment report viewed',
      metadata: {
        count: meta.total,
        search: options.search ?? null,
        cityId: options.cityId ?? null,
        minBalance: options.minBalance ?? null,
        maxBalance: options.maxBalance ?? null,
        minLastPaymentDays: options.minLastPaymentDays ?? null,
        maxLastPaymentDays: options.maxLastPaymentDays ?? null,
        page: meta.page,
        limit: meta.limit,
      },
    });

    return { data, meta };
  }

  async buildLowPaymentCustomers(
    tenantDb: DataSource,
    businessId: string,
    balanceRows: CustomerBalanceRow[],
    options: CustomerLowPaymentOptions = {},
  ) {
    const {
      search,
      cityId,
      minBalance,
      maxBalance,
      minLastPaymentDays,
      maxLastPaymentDays,
    } = options;

    let rows = balanceRows.filter((row) => row.currentBalance > 0);

    if (search?.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((row) => row.name.toLowerCase().includes(term));
    }

    if (minBalance != null) {
      rows = rows.filter((row) => row.currentBalance >= minBalance);
    }
    if (maxBalance != null) {
      rows = rows.filter((row) => row.currentBalance <= maxBalance);
    }

    rows.sort((a, b) => b.currentBalance - a.currentBalance);

    if (rows.length === 0) {
      return [];
    }

    let partyIds = rows.map((row) => row.id);
    const [parties, lastPayments] = await Promise.all([
      tenantDb.getRepository(Party).find({
        where: {
          businessId,
          id: In(partyIds),
        },
        select: { id: true, cityId: true },
      }),
      this.getLastPaidSaleVouchersByPartyIds(tenantDb, businessId, partyIds),
    ]);

    if (cityId) {
      const cityPartyIds = new Set(
        parties.filter((party) => party.cityId === cityId).map((party) => party.id),
      );
      rows = rows.filter((row) => cityPartyIds.has(row.id));
      partyIds = rows.map((row) => row.id);
    }

    if (rows.length === 0) {
      return [];
    }

    const cityByPartyId = new Map(
      parties.map((party) => [party.id, party.cityId]),
    );

    const cityIds = [
      ...new Set(
        rows
          .map((row) => cityByPartyId.get(row.id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const cityNames = new Map<string, string | null>();
    await Promise.all(
      cityIds.map(async (id) => {
        cityNames.set(id, await this.masterGeoHelperService.getCityNameById(id));
      }),
    );

    let results: CustomerLowPaymentRow[] = rows.map((row) => {
      const partyCityId = cityByPartyId.get(row.id) ?? null;
      const lastPayment = lastPayments.get(row.id);
      return {
        name: row.name,
        cityName: partyCityId ? cityNames.get(partyCityId) ?? null : null,
        balance: this.formatAmount(row.currentBalance),
        lastPaymentAmount: lastPayment
          ? this.formatAmount(lastPayment.paymentAmount)
          : '-',
        lastPaymentDays: lastPayment
          ? this.daysSincePaymentDate(lastPayment.paymentDate)
          : '-',
      };
    });

    if (minLastPaymentDays != null || maxLastPaymentDays != null) {
      results = results.filter((row) => {
        if (row.lastPaymentDays === '-') {
          return false;
        }
        if (
          minLastPaymentDays != null &&
          row.lastPaymentDays < minLastPaymentDays
        ) {
          return false;
        }
        if (
          maxLastPaymentDays != null &&
          row.lastPaymentDays > maxLastPaymentDays
        ) {
          return false;
        }
        return true;
      });
    }

    return results;
  }

  private formatAmount(value: number): string {
    return roundAmount(value).toFixed(2);
  }

  private todayStartUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  private daysSincePaymentDate(paymentDate: Date): number {
    const todayStart = this.todayStartUtc();
    const paymentDay = new Date(
      Date.UTC(
        paymentDate.getUTCFullYear(),
        paymentDate.getUTCMonth(),
        paymentDate.getUTCDate(),
      ),
    );
    return Math.floor(
      (todayStart.getTime() - paymentDay.getTime()) / 86_400_000,
    );
  }

  private async getLastPaidSaleVouchersByPartyIds(
    tenantDb: DataSource,
    businessId: string,
    partyIds: string[],
  ): Promise<Map<string, { paymentAmount: number; paymentDate: Date }>> {
    if (partyIds.length === 0) {
      return new Map();
    }

    const rows = await tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.party', 'party')
      .distinctOn(['voucher.partyId'])
      .select('voucher.partyId', 'partyId')
      .addSelect('voucher.paymentAmount', 'paymentAmount')
      .addSelect('voucher.paymentDate', 'paymentDate')
      .where('party.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PAID })
      .andWhere('voucher.partyId IN (:...partyIds)', { partyIds })
      .orderBy('voucher.partyId', 'ASC')
      .addOrderBy('voucher.paymentDate', 'DESC')
      .addOrderBy('voucher.createdAt', 'DESC')
      .getRawMany<{
        partyId: string;
        paymentAmount: string;
        paymentDate: Date;
      }>();

    return new Map(
      rows.map((row) => [
        row.partyId,
        {
          paymentAmount: Number(row.paymentAmount),
          paymentDate: new Date(row.paymentDate),
        },
      ]),
    );
  }
}
