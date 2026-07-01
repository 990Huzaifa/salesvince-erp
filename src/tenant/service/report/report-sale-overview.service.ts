import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleInvoiceItem } from 'src/tenant-db/entities/sale-invoice.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  endOfDay,
  roundAmount,
  startOfDay,
} from './report-query.helper';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type MonthLabel = (typeof MONTH_LABELS)[number];

type SaleOverviewItemRow = {
  itemName: string;
  totalSales: string;
};

type SaleOverviewData = Record<MonthLabel, SaleOverviewItemRow[]>;

type SaleOverviewFilters = {
  startDate: Date;
  endDate: Date;
  partyId?: string;
  cityId?: string;
};

@Injectable()
export class ReportSaleOverviewService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getSaleOverview(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      year?: number;
      partyId?: string;
      cityId?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const year = options.year ?? new Date().getFullYear();
    const partyId = options.partyId?.trim() || undefined;
    const cityId = options.cityId?.trim() || undefined;
    const filters: SaleOverviewFilters = {
      startDate: startOfDay(new Date(year, 0, 1)),
      endDate: endOfDay(new Date(year, 11, 31)),
      partyId,
      cityId,
    };

    const salesData = await this.fetchYearlyProductSalesByMonth(
      tenantDb,
      scopedBusinessId,
      filters,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_OVERVIEW_REPORT_VIEWED',
      description: 'Sale overview report viewed',
      metadata: {
        year,
        partyId: partyId ?? null,
        cityId: cityId ?? null,
      },
    });

    return { salesData };
  }

  private formatAmount(value: number): string {
    return roundAmount(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private createEmptySalesData(): SaleOverviewData {
    return MONTH_LABELS.reduce((acc, month) => {
      acc[month] = [];
      return acc;
    }, {} as SaleOverviewData);
  }

  private applyInvoiceFilters(
    qb: ReturnType<
      ReturnType<DataSource['getRepository']>['createQueryBuilder']
    >,
    invoiceAlias: string,
    partyAlias: string,
    businessId: string,
    filters: SaleOverviewFilters,
  ) {
    qb.where(`${invoiceAlias}.businessId = :businessId`, { businessId })
      .andWhere(`${invoiceAlias}.deletedAt IS NULL`)
      .andWhere(`${invoiceAlias}.invoiceDate >= :startDate`, {
        startDate: filters.startDate,
      })
      .andWhere(`${invoiceAlias}.invoiceDate <= :endDate`, {
        endDate: filters.endDate,
      });

    if (filters.partyId) {
      qb.andWhere(`${partyAlias}.id = :partyId`, { partyId: filters.partyId });
    }
    if (filters.cityId) {
      qb.andWhere(`${partyAlias}.cityId = :cityId`, { cityId: filters.cityId });
    }

    return qb;
  }

  private async fetchYearlyProductSalesByMonth(
    tenantDb: DataSource,
    businessId: string,
    filters: SaleOverviewFilters,
  ): Promise<SaleOverviewData> {
    const rows = await this.applyInvoiceFilters(
      tenantDb
        .getRepository(SaleInvoiceItem)
        .createQueryBuilder('item')
        .innerJoin('item.saleInvoice', 'invoice')
        .innerJoin('invoice.customer', 'party')
        .innerJoin('item.product', 'product')
        .andWhere('item.deletedAt IS NULL')
        .select('EXTRACT(MONTH FROM invoice.invoiceDate)', 'month')
        .addSelect('product.name', 'itemName')
        .addSelect('COALESCE(SUM(item.totalAmount), 0)', 'totalSales'),
      'invoice',
      'party',
      businessId,
      filters,
    )
      .groupBy('EXTRACT(MONTH FROM invoice.invoiceDate)')
      .addGroupBy('product.id')
      .addGroupBy('product.name')
      .orderBy('EXTRACT(MONTH FROM invoice.invoiceDate)', 'ASC')
      .addOrderBy('COALESCE(SUM(item.totalAmount), 0)', 'DESC')
      .getRawMany<{
        month: string;
        itemName: string;
        totalSales: string;
      }>();

    const salesData = this.createEmptySalesData();

    for (const row of rows) {
      const monthIndex = Number(row.month) - 1;
      if (monthIndex < 0 || monthIndex > 11) {
        continue;
      }

      const monthLabel = MONTH_LABELS[monthIndex];
      salesData[monthLabel].push({
        itemName: row.itemName,
        totalSales: this.formatAmount(Number(row.totalSales ?? 0)),
      });
    }

    return salesData;
  }
}
