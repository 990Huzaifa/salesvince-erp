import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { ActivityLogService } from '../activity-log.service';
import { MasterGeoHelperService } from '../master-geo-helper.service';
import {
  loadApprovedSaleReturnLines,
  MatchedReturnLine,
} from './report-returns.helper';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  resolvePagination,
  roundAmount,
  startOfDay,
} from './report-query.helper';

const TOP_CUSTOMERS_LIMIT = 8;
const PROFIT_SHARE_TOP_LIMIT = 5;

type ProfitByCustomerOptions = {
  customerId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  recordActivity?: boolean;
};

type CostSnapshot = {
  purchaseUnitPrice: number;
  quantity: number;
};

type InvoiceProfitSlice = {
  invoiceId: string;
  invoiceDate: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  cityId: string | null;
  saleAmount: number;
  costAmount: number;
  profit: number;
};

type CustomerProfitRow = {
  customerId: string;
  customerCode: string;
  customerName: string;
  city: string | null;
  invoiceCount: number;
  lastSaleDate: string | null;
  saleAmount: number;
  costAmount: number;
  profit: number;
  margin: number;
};

type DailyTrendRow = {
  date: string;
  saleAmount: number;
  costAmount: number;
  profit: number;
};

type TopCustomerRow = {
  customerId: string;
  customerCode: string;
  customerName: string;
  saleAmount: number;
  costAmount: number;
  profit: number;
  margin: number;
};

type ProfitShareNamedRow = {
  customerId: string;
  customerCode: string;
  customerName: string;
  profit: number;
};

type ProfitShareOthersRow = {
  customerId: null;
  customerCode: null;
  customerName: 'Others';
  customerCount: number;
  profit: number;
};

type ProfitShareRow = ProfitShareNamedRow | ProfitShareOthersRow;

type ProfitByCustomerTotals = {
  customerCount: number;
  invoiceCount: number;
  saleAmount: number;
  costAmount: number;
  profit: number;
  margin: number;
};

@Injectable()
export class ReportProfitByCustomerService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
  ) {}

  async getProfitByCustomer(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: ProfitByCustomerOptions,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );
    const customerId = options.customerId?.trim() || undefined;

    if (customerId) {
      await this.assertCustomerParty(tenantDb, scopedBusinessId, customerId);
    }

    const invoices = await this.loadInvoices(tenantDb, scopedBusinessId, {
      customerId,
      startDate,
      endDate,
    });

    const saleReturnLines = await loadApprovedSaleReturnLines(
      tenantDb,
      scopedBusinessId,
      {
        partyId: customerId,
        saleInvoiceIds: invoices.map((invoice) => invoice.id),
      },
    );
    const returnsByInvoiceId = this.groupReturnsByInvoiceId(saleReturnLines);

    const invoiceSlices = invoices.map((invoice) =>
      this.buildInvoiceSlice(
        invoice,
        returnsByInvoiceId.get(invoice.id) ?? [],
      ),
    );

    const allRows = await this.buildCustomerRows(invoiceSlices);
    allRows.sort((left, right) => right.profit - left.profit);

    const totals = this.buildTotals(allRows, invoiceSlices.length);
    const dailyTrend = this.buildDailyTrend(invoiceSlices);
    const topCustomers = this.buildTopCustomers(allRows);
    const profitShare = this.buildProfitShare(allRows);

    const { page, limit, skip } = resolvePagination(options.page, options.limit);
    const rows = allRows.slice(skip, skip + limit);

    if (options.recordActivity !== false) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: actorUserId,
        businessId: scopedBusinessId,
        action: 'PROFIT_BY_CUSTOMER_REPORT_VIEWED',
        description: 'Profit by customer report viewed',
        metadata: {
          customerId: customerId ?? null,
          startDate: options.startDate ?? null,
          endDate: options.endDate ?? null,
          totals,
        },
      });
    }

    return {
      filters: {
        customerId: customerId ?? null,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      totals,
      dailyTrend,
      topCustomers,
      profitShare,
      rows,
      meta: {
        page,
        limit,
        total: totals.customerCount,
        lastPage: Math.max(1, Math.ceil(totals.customerCount / limit) || 1),
      },
    };
  }

  private async loadInvoices(
    tenantDb: DataSource,
    businessId: string,
    filters: {
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<SaleInvoice[]> {
    const qb = tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('saleOrder.items', 'saleOrderItems')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('(items.id IS NULL OR items.deletedAt IS NULL)');

    if (filters.customerId) {
      qb.andWhere('invoice.customerId = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.startDate) {
      qb.andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(filters.startDate),
      });
    }
    if (filters.endDate) {
      qb.andWhere('invoice.invoiceDate <= :endDate', {
        endDate: endOfDay(filters.endDate),
      });
    }

    return qb
      .orderBy('invoice.invoiceDate', 'DESC')
      .addOrderBy('invoice.createdAt', 'DESC')
      .getMany();
  }

  private groupReturnsByInvoiceId(
    lines: MatchedReturnLine[],
  ): Map<string, MatchedReturnLine[]> {
    const map = new Map<string, MatchedReturnLine[]>();
    for (const line of lines) {
      const invoiceId = line.saleInvoiceId;
      if (!invoiceId) {
        continue;
      }
      const existing = map.get(invoiceId) ?? [];
      existing.push(line);
      map.set(invoiceId, existing);
    }
    return map;
  }

  private buildInvoiceSlice(
    invoice: SaleInvoice,
    returnLines: MatchedReturnLine[],
  ): InvoiceProfitSlice {
    const costSnapshots = this.buildCostSnapshots(invoice);
    let saleAmount = 0;
    let costAmount = 0;
    const items = (invoice.items ?? []).filter((item) => !item.deletedAt);

    for (const item of items) {
      const quantity = Number(item.quantity ?? 0);
      saleAmount = roundAmount(saleAmount + Number(item.totalAmount ?? 0));

      if (!item.productId || !item.uomId) {
        continue;
      }

      const costSnapshot = costSnapshots.get(
        this.saleLineKey(item.productId, item.uomId, item.productFlavourId),
      );
      costAmount = roundAmount(
        costAmount + (costSnapshot?.purchaseUnitPrice ?? 0) * quantity,
      );
    }

    for (const line of returnLines) {
      saleAmount = roundAmount(saleAmount - line.grossAmount);
      costAmount = roundAmount(costAmount - line.costAmount);
    }

    return {
      invoiceId: invoice.id,
      invoiceDate: this.formatDateOnly(invoice.invoiceDate) ?? '',
      customerId: invoice.customerId,
      customerCode: invoice.customer?.code ?? '',
      customerName: invoice.customer?.name ?? '',
      cityId: invoice.customer?.cityId ?? null,
      saleAmount,
      costAmount,
      profit: roundAmount(saleAmount - costAmount),
    };
  }

  private async buildCustomerRows(
    slices: InvoiceProfitSlice[],
  ): Promise<CustomerProfitRow[]> {
    type Acc = {
      customerId: string;
      customerCode: string;
      customerName: string;
      cityId: string | null;
      invoiceIds: Set<string>;
      lastSaleDate: string | null;
      saleAmount: number;
      costAmount: number;
    };

    const byCustomer = new Map<string, Acc>();

    for (const slice of slices) {
      const existing = byCustomer.get(slice.customerId) ?? {
        customerId: slice.customerId,
        customerCode: slice.customerCode,
        customerName: slice.customerName,
        cityId: slice.cityId,
        invoiceIds: new Set<string>(),
        lastSaleDate: null as string | null,
        saleAmount: 0,
        costAmount: 0,
      };

      existing.invoiceIds.add(slice.invoiceId);
      existing.saleAmount = roundAmount(existing.saleAmount + slice.saleAmount);
      existing.costAmount = roundAmount(existing.costAmount + slice.costAmount);
      if (
        !existing.lastSaleDate ||
        slice.invoiceDate > existing.lastSaleDate
      ) {
        existing.lastSaleDate = slice.invoiceDate || existing.lastSaleDate;
      }
      byCustomer.set(slice.customerId, existing);
    }

    const cityIds = [
      ...new Set(
        [...byCustomer.values()]
          .map((row) => row.cityId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const cityNames = new Map<string, string | null>();
    await Promise.all(
      cityIds.map(async (id) => {
        cityNames.set(id, await this.masterGeoHelperService.getCityNameById(id));
      }),
    );

    return [...byCustomer.values()].map((row) => {
      const profit = roundAmount(row.saleAmount - row.costAmount);
      return {
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerName: row.customerName,
        city: row.cityId ? cityNames.get(row.cityId) ?? null : null,
        invoiceCount: row.invoiceIds.size,
        lastSaleDate: row.lastSaleDate,
        saleAmount: row.saleAmount,
        costAmount: row.costAmount,
        profit,
        margin:
          row.saleAmount > 0
            ? roundAmount((profit / row.saleAmount) * 100)
            : 0,
      };
    });
  }

  private buildTotals(
    rows: CustomerProfitRow[],
    invoiceCount: number,
  ): ProfitByCustomerTotals {
    let saleAmount = 0;
    let costAmount = 0;

    for (const row of rows) {
      saleAmount = roundAmount(saleAmount + row.saleAmount);
      costAmount = roundAmount(costAmount + row.costAmount);
    }

    const profit = roundAmount(saleAmount - costAmount);
    return {
      customerCount: rows.length,
      invoiceCount,
      saleAmount,
      costAmount,
      profit,
      margin: saleAmount > 0 ? roundAmount((profit / saleAmount) * 100) : 0,
    };
  }

  private buildDailyTrend(slices: InvoiceProfitSlice[]): DailyTrendRow[] {
    const byDate = new Map<
      string,
      { saleAmount: number; costAmount: number; profit: number }
    >();

    for (const slice of slices) {
      if (!slice.invoiceDate) {
        continue;
      }
      const existing = byDate.get(slice.invoiceDate) ?? {
        saleAmount: 0,
        costAmount: 0,
        profit: 0,
      };
      existing.saleAmount = roundAmount(existing.saleAmount + slice.saleAmount);
      existing.costAmount = roundAmount(existing.costAmount + slice.costAmount);
      existing.profit = roundAmount(existing.saleAmount - existing.costAmount);
      byDate.set(slice.invoiceDate, existing);
    }

    return [...byDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, values]) => ({
        date,
        saleAmount: values.saleAmount,
        costAmount: values.costAmount,
        profit: values.profit,
      }));
  }

  private buildTopCustomers(rows: CustomerProfitRow[]): TopCustomerRow[] {
    return rows.slice(0, TOP_CUSTOMERS_LIMIT).map((row) => ({
      customerId: row.customerId,
      customerCode: row.customerCode,
      customerName: row.customerName,
      saleAmount: row.saleAmount,
      costAmount: row.costAmount,
      profit: row.profit,
      margin: row.margin,
    }));
  }

  private buildProfitShare(rows: CustomerProfitRow[]): ProfitShareRow[] {
    const top = rows.slice(0, PROFIT_SHARE_TOP_LIMIT);
    const share: ProfitShareRow[] = top.map((row) => ({
      customerId: row.customerId,
      customerCode: row.customerCode,
      customerName: row.customerName,
      profit: Math.max(row.profit, 0),
    }));

    if (rows.length <= PROFIT_SHARE_TOP_LIMIT) {
      return share;
    }

    const remaining = rows.slice(PROFIT_SHARE_TOP_LIMIT);
    const othersProfit = roundAmount(
      remaining.reduce(
        (sum, row) => sum + Math.max(row.profit, 0),
        0,
      ),
    );

    share.push({
      customerId: null,
      customerCode: null,
      customerName: 'Others',
      customerCount: remaining.length,
      profit: othersProfit,
    });

    return share;
  }

  private buildCostSnapshots(invoice: SaleInvoice): Map<string, CostSnapshot> {
    const snapshots = new Map<string, CostSnapshot>();
    const orderItems = invoice.saleOrder?.items ?? [];

    for (const item of orderItems) {
      if (!item.productId || !item.uomId) {
        continue;
      }
      const key = this.saleLineKey(
        item.productId,
        item.uomId,
        item.productFlavourId,
      );
      const existing = snapshots.get(key) ?? {
        purchaseUnitPrice: 0,
        quantity: 0,
      };
      const quantity = Number(item.quantity ?? 0);
      const previousCost = existing.purchaseUnitPrice * existing.quantity;
      const nextCost = Number(item.purchaseUnitPrice ?? 0) * quantity;
      const nextQuantity = existing.quantity + quantity;

      snapshots.set(key, {
        purchaseUnitPrice:
          nextQuantity > 0
            ? roundAmount((previousCost + nextCost) / nextQuantity)
            : 0,
        quantity: nextQuantity,
      });
    }

    return snapshots;
  }

  private saleLineKey(
    productId: string,
    uomId: string,
    productFlavourId?: string | null,
  ): string {
    return `${productId}:${uomId}:${productFlavourId ?? ''}`;
  }

  private formatDateOnly(value: Date | string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      return this.toLocalDateString(parsed);
    }
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return this.toLocalDateString(value);
  }

  private toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async assertCustomerParty(
    tenantDb: DataSource,
    businessId: string,
    customerId: string,
  ): Promise<Party> {
    const party = await tenantDb.getRepository(Party).findOne({
      where: {
        id: customerId,
        businessId,
        deletedAt: IsNull(),
      },
    });

    if (!party) {
      throw new BadRequestException('Customer not found');
    }

    if (
      party.type !== PartyType.CUSTOMER &&
      party.type !== PartyType.BOTH
    ) {
      throw new BadRequestException(
        'Party type is not valid for profit by customer report',
      );
    }

    return party;
  }
}
