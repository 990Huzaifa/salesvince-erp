import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { ActivityLogService } from '../activity-log.service';
import { MasterGeoHelperService } from '../master-geo-helper.service';
import { ReportSaleChartFilterType } from 'src/tenant/dto/report/report-sale-chart.query.dto';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type SaleChartFilters = {
  startDate?: Date;
  endDate?: Date;
  partyId?: string;
  cityId?: string;
};

type ProductChartRow = {
  itemName: string;
  uom: string;
  totalSales: string;
};

type CustomerChartRow = {
  customerName: string;
  totalSales: string;
};

type MonthChartRow = {
  month: string;
  totalSales: string;
};

type CityChartRow = {
  cityName: string;
  totalSales: string;
};

@Injectable()
export class ReportSaleChartService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
  ) {}

  async getSaleChart(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      filterType: ReportSaleChartFilterType;
      startDate?: string;
      endDate?: string;
      partyId?: string;
      cityId?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );
    const partyId = options.partyId?.trim() || undefined;
    const cityId = options.cityId?.trim() || undefined;
    const filters: SaleChartFilters = { startDate, endDate, partyId, cityId };

    let salesData:
      | ProductChartRow[]
      | CustomerChartRow[]
      | MonthChartRow[]
      | CityChartRow[];

    switch (options.filterType) {
      case ReportSaleChartFilterType.PRODUCT:
        salesData = await this.fetchByProduct(tenantDb, scopedBusinessId, filters);
        break;
      case ReportSaleChartFilterType.CUSTOMER:
        salesData = await this.fetchByCustomer(
          tenantDb,
          scopedBusinessId,
          filters,
        );
        break;
      case ReportSaleChartFilterType.MONTH:
        salesData = await this.fetchByMonth(tenantDb, scopedBusinessId, filters);
        break;
      case ReportSaleChartFilterType.CITY:
        salesData = await this.fetchByCity(tenantDb, scopedBusinessId, filters);
        break;
      default:
        throw new BadRequestException('Invalid filterType');
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_CHART_REPORT_VIEWED',
      description: 'Sale chart report viewed',
      metadata: {
        filterType: options.filterType,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        partyId: partyId ?? null,
        cityId: cityId ?? null,
        rowCount: salesData.length,
      },
    });

    return { salesData };
  }

  private formatAmount(value: number): string {
    return roundAmount(value).toFixed(2);
  }

  private applyInvoiceFilters(
    qb: ReturnType<
      ReturnType<DataSource['getRepository']>['createQueryBuilder']
    >,
    invoiceAlias: string,
    partyAlias: string,
    businessId: string,
    filters: SaleChartFilters,
  ) {
    qb.where(`${invoiceAlias}.businessId = :businessId`, { businessId }).andWhere(
      `${invoiceAlias}.deletedAt IS NULL`,
    );

    if (filters.startDate) {
      qb.andWhere(`${invoiceAlias}.invoiceDate >= :startDate`, {
        startDate: startOfDay(filters.startDate),
      });
    }
    if (filters.endDate) {
      qb.andWhere(`${invoiceAlias}.invoiceDate <= :endDate`, {
        endDate: endOfDay(filters.endDate),
      });
    }
    if (filters.partyId) {
      qb.andWhere(`${partyAlias}.id = :partyId`, { partyId: filters.partyId });
    }
    if (filters.cityId) {
      qb.andWhere(`${partyAlias}.cityId = :cityId`, { cityId: filters.cityId });
    }

    return qb;
  }

  private async fetchByProduct(
    tenantDb: DataSource,
    businessId: string,
    filters: SaleChartFilters,
  ): Promise<ProductChartRow[]> {
    const qb = this.applyInvoiceFilters(
      tenantDb
        .getRepository(SaleInvoiceItem)
        .createQueryBuilder('item')
        .innerJoin('item.saleInvoice', 'invoice')
        .innerJoin('invoice.customer', 'party')
        .innerJoin('item.product', 'product')
        .innerJoin('item.uom', 'uom')
        .andWhere('item.deletedAt IS NULL'),
      'invoice',
      'party',
      businessId,
      filters,
    )
      .select('product.name', 'itemName')
      .addSelect('uom.name', 'uom')
      .addSelect('COALESCE(SUM(item.totalAmount), 0)', 'totalSales')
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('uom.id')
      .addGroupBy('uom.name')
      .orderBy('COALESCE(SUM(item.totalAmount), 0)', 'DESC');

    const rows = await qb.getRawMany<{
      itemName: string;
      uom: string;
      totalSales: string;
    }>();

    return rows.map((row) => ({
      itemName: row.itemName,
      uom: row.uom,
      totalSales: this.formatAmount(Number(row.totalSales ?? 0)),
    }));
  }

  private async fetchByCustomer(
    tenantDb: DataSource,
    businessId: string,
    filters: SaleChartFilters,
  ): Promise<CustomerChartRow[]> {
    const qb = this.applyInvoiceFilters(
      tenantDb
        .getRepository(SaleInvoice)
        .createQueryBuilder('invoice')
        .innerJoin('invoice.customer', 'party'),
      'invoice',
      'party',
      businessId,
      filters,
    )
      .select('party.name', 'customerName')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'totalSales')
      .groupBy('party.id')
      .addGroupBy('party.name')
      .orderBy('COALESCE(SUM(invoice.totalAmount), 0)', 'DESC');

    const rows = await qb.getRawMany<{
      customerName: string;
      totalSales: string;
    }>();

    return rows.map((row) => ({
      customerName: row.customerName,
      totalSales: this.formatAmount(Number(row.totalSales ?? 0)),
    }));
  }

  private async fetchByMonth(
    tenantDb: DataSource,
    businessId: string,
    filters: SaleChartFilters,
  ): Promise<MonthChartRow[]> {
    const qb = this.applyInvoiceFilters(
      tenantDb
        .getRepository(SaleInvoice)
        .createQueryBuilder('invoice')
        .innerJoin('invoice.customer', 'party'),
      'invoice',
      'party',
      businessId,
      filters,
    )
      .select(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`, 'month')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'totalSales')
      .groupBy(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`)
      .orderBy(`TO_CHAR(invoice.invoiceDate, 'YYYY-MM')`, 'ASC');

    const rows = await qb.getRawMany<{
      month: string;
      totalSales: string;
    }>();

    return rows.map((row) => ({
      month: row.month,
      totalSales: this.formatAmount(Number(row.totalSales ?? 0)),
    }));
  }

  private async fetchByCity(
    tenantDb: DataSource,
    businessId: string,
    filters: SaleChartFilters,
  ): Promise<CityChartRow[]> {
    const qb = this.applyInvoiceFilters(
      tenantDb
        .getRepository(SaleInvoice)
        .createQueryBuilder('invoice')
        .innerJoin('invoice.customer', 'party'),
      'invoice',
      'party',
      businessId,
      filters,
    )
      .select('party.cityId', 'cityId')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'totalSales')
      .groupBy('party.cityId')
      .orderBy('COALESCE(SUM(invoice.totalAmount), 0)', 'DESC');

    const rows = await qb.getRawMany<{
      cityId: string | null;
      totalSales: string;
    }>();

    const cityNames = await this.resolveCityNameMap(
      rows.map((row) => row.cityId),
    );

    return rows.map((row) => ({
      cityName: this.cityDisplayName(row.cityId, cityNames),
      totalSales: this.formatAmount(Number(row.totalSales ?? 0)),
    }));
  }

  private async resolveCityNameMap(
    cityIds: Array<string | null | undefined>,
  ): Promise<Map<string, string | null>> {
    const uniqueCityIds = [
      ...new Set(
        cityIds.filter((cityId): cityId is string => Boolean(cityId?.trim())),
      ),
    ];
    const cityNames = new Map<string, string | null>();

    await Promise.all(
      uniqueCityIds.map(async (cityId) => {
        cityNames.set(
          cityId,
          await this.masterGeoHelperService.getCityNameById(cityId),
        );
      }),
    );

    return cityNames;
  }

  private cityDisplayName(
    cityId: string | null | undefined,
    cityNames: Map<string, string | null>,
  ): string {
    if (!cityId) {
      return 'Unknown';
    }
    return cityNames.get(cityId) ?? 'Unknown';
  }
}
