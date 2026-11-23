import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { ActivityLogService } from '../activity-log.service';
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

type ProfitByInvoiceOptions = {
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

type ProfitByInvoiceRow = {
  id: string;
  invoiceDate: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  itemCount: number;
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

type ProfitByInvoiceTotals = {
  invoiceCount: number;
  saleAmount: number;
  costAmount: number;
  profit: number;
  margin: number;
};

@Injectable()
export class ReportProfitByInvoiceService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getProfitByInvoice(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: ProfitByInvoiceOptions,
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

    const invoices = await this.loadInvoices(
      tenantDb,
      scopedBusinessId,
      { customerId, startDate, endDate },
    );

    const saleReturnLines = await loadApprovedSaleReturnLines(
      tenantDb,
      scopedBusinessId,
      {
        partyId: customerId,
        saleInvoiceIds: invoices.map((invoice) => invoice.id),
      },
    );

    const returnsByInvoiceId = this.groupReturnsByInvoiceId(saleReturnLines);
    const allRows = invoices
      .map((invoice) =>
        this.buildInvoiceRow(
          invoice,
          returnsByInvoiceId.get(invoice.id) ?? [],
        ),
      )
      .sort((left, right) => {
        if (left.invoiceDate === right.invoiceDate) {
          return right.invoiceNumber.localeCompare(left.invoiceNumber);
        }
        return right.invoiceDate.localeCompare(left.invoiceDate);
      });

    const totals = this.buildTotals(allRows);
    const dailyTrend = this.buildDailyTrend(allRows);
    const { page, limit, skip } = resolvePagination(options.page, options.limit);
    const rows = allRows.slice(skip, skip + limit);

    if (options.recordActivity !== false) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: actorUserId,
        businessId: scopedBusinessId,
        action: 'PROFIT_BY_INVOICE_REPORT_VIEWED',
        description: 'Profit by invoice report viewed',
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
      rows,
      meta: {
        page,
        limit,
        total: totals.invoiceCount,
        lastPage: Math.max(1, Math.ceil(totals.invoiceCount / limit) || 1),
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

  private buildInvoiceRow(
    invoice: SaleInvoice,
    returnLines: MatchedReturnLine[],
  ): ProfitByInvoiceRow {
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

    const profit = roundAmount(saleAmount - costAmount);
    const margin =
      saleAmount > 0 ? roundAmount((profit / saleAmount) * 100) : 0;

    return {
      id: invoice.id,
      invoiceDate: this.formatDateOnly(invoice.invoiceDate) ?? '',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerCode: invoice.customer?.code ?? '',
      customerName: invoice.customer?.name ?? '',
      itemCount: items.length,
      saleAmount,
      costAmount,
      profit,
      margin,
    };
  }

  private buildTotals(rows: ProfitByInvoiceRow[]): ProfitByInvoiceTotals {
    let saleAmount = 0;
    let costAmount = 0;

    for (const row of rows) {
      saleAmount = roundAmount(saleAmount + row.saleAmount);
      costAmount = roundAmount(costAmount + row.costAmount);
    }

    const profit = roundAmount(saleAmount - costAmount);
    return {
      invoiceCount: rows.length,
      saleAmount,
      costAmount,
      profit,
      margin: saleAmount > 0 ? roundAmount((profit / saleAmount) * 100) : 0,
    };
  }

  private buildDailyTrend(rows: ProfitByInvoiceRow[]): DailyTrendRow[] {
    const byDate = new Map<
      string,
      { saleAmount: number; costAmount: number; profit: number }
    >();

    for (const row of rows) {
      const existing = byDate.get(row.invoiceDate) ?? {
        saleAmount: 0,
        costAmount: 0,
        profit: 0,
      };
      existing.saleAmount = roundAmount(existing.saleAmount + row.saleAmount);
      existing.costAmount = roundAmount(existing.costAmount + row.costAmount);
      existing.profit = roundAmount(existing.saleAmount - existing.costAmount);
      byDate.set(row.invoiceDate, existing);
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
        'Party type is not valid for profit by invoice report',
      );
    }

    return party;
  }
}
