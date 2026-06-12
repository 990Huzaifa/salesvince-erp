import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import {
  OrderStatus,
  SaleOrder,
} from 'src/tenant-db/entities/sale-order.entity';
import {
  DeliveryNote,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import {
  PurchaseOrder,
} from 'src/tenant-db/entities/purchase-order.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { PurchaseVoucher } from 'src/tenant-db/entities/purchase-voucher.entity';
import { ExpenseVoucher } from 'src/tenant-db/entities/expense-voucher.entity';
import { ContraVoucher } from 'src/tenant-db/entities/contra-voucher.entity';
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleInvoiceItem } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { Product } from 'src/tenant-db/entities/product.entity';
import { ReportService } from './report.service';
import { MasterGeoHelperService } from './master-geo-helper.service';
import { ActivityLogService } from './activity-log.service';

export type DashboardReviewObjectType =
  | 'SO'
  | 'DN'
  | 'SV'
  | 'PO'
  | 'GRN'
  | 'PV'
  | 'EV'
  | 'CV';

type ReviewRow = {
  objectType: DashboardReviewObjectType;
  id: string;
  documentNumber: string;
  partyName: string;
  documentDate: Date;
};

type MonthYearCount = { month: number; year: number; count: number };

type PieSegment = {
  key: 'complete' | 'pending' | 'canceled';
  label: string;
  count: number;
  percentage: number;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly reportService: ReportService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private formatAmount(value: number): string {
    return this.roundAmount(value).toFixed(2);
  }

  private parseDateParam(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return parsed;
  }

  private parseYearMonth(dateStr: string): { year: number; month: number } {
    const match = /^(\d{4})-(\d{1,2})$/.exec(dateStr.trim());
    if (!match) {
      throw new BadRequestException('date must be in YYYY-M or YYYY-MM format');
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      throw new BadRequestException('Invalid month in date');
    }
    return { year, month };
  }

  private monthBounds(
    year: number,
    month: number,
  ): { start: Date; end: Date; lastDay: number } {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { start, end, lastDay: end.getUTCDate() };
  }

  private previousMonthBounds(year: number, month: number): {
    start: Date;
    end: Date;
  } {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return this.monthBounds(prevYear, prevMonth);
  }

  private todayBounds(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const end = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    return { start, end };
  }

  private rollingDaysBounds(days: number): { start: Date; end: Date } {
    const { start: todayStart, end } = this.todayBounds();
    const start = new Date(todayStart);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return { start, end };
  }

  private calcMonthTrend(
    current: number,
    previous: number,
  ): { percentageIncrease: number; trend: 0 | 1 } {
    const percentageIncrease =
      previous > 0
        ? this.roundAmount(((current - previous) / previous) * 100)
        : current > 0
          ? 100
          : 0;
    return {
      percentageIncrease,
      trend: current >= previous ? 1 : 0,
    };
  }

  private calcLifetimeVsPreviousMonthTrend(
    total: number,
    previousMonth: number,
  ): number {
    if (previousMonth <= 0) {
      return total > 0 ? 100 : 0;
    }
    return this.roundAmount(((total - previousMonth) / previousMonth) * 100);
  }

  private async sumSaleInvoices(
    tenantDb: DataSource,
    businessId: string,
    start?: Date,
    end?: Date,
  ): Promise<number> {
    const qb = tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'total')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL');

    if (start) {
      qb.andWhere('invoice.invoiceDate >= :start', { start });
    }
    if (end) {
      qb.andWhere('invoice.invoiceDate <= :end', { end });
    }

    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async sumPurchaseInvoices(
    tenantDb: DataSource,
    businessId: string,
    start?: Date,
    end?: Date,
  ): Promise<number> {
    const qb = tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .select('COALESCE(SUM(invoice.totalAmount), 0)', 'total')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL');

    if (start) {
      qb.andWhere('invoice.invoiceDate >= :start', { start });
    }
    if (end) {
      qb.andWhere('invoice.invoiceDate <= :end', { end });
    }

    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async sumSaleVouchersPaid(
    tenantDb: DataSource,
    businessId: string,
    start?: Date,
    end?: Date,
  ): Promise<number> {
    const qb = tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.party', 'party')
      .select('COALESCE(SUM(voucher.paymentAmount), 0)', 'total')
      .where('party.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PAID });

    if (start) {
      qb.andWhere('voucher.paymentDate >= :start', { start });
    }
    if (end) {
      qb.andWhere('voucher.paymentDate <= :end', { end });
    }

    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async buildSalesSnapshot(
    tenantDb: DataSource,
    businessId: string,
  ) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const { start: currentStart, end: currentEnd } = this.monthBounds(
      year,
      month,
    );
    const { start: prevStart, end: prevEnd } = this.previousMonthBounds(
      year,
      month,
    );
    const { start: todayStart, end: todayEnd } = this.todayBounds();

    const [
      totalSale,
      currentMonthSale,
      previousMonthTotalSale,
      todaySale,
    ] = await Promise.all([
      this.sumSaleInvoices(tenantDb, businessId),
      this.sumSaleInvoices(tenantDb, businessId, currentStart, currentEnd),
      this.sumSaleInvoices(tenantDb, businessId, prevStart, prevEnd),
      this.sumSaleInvoices(tenantDb, businessId, todayStart, todayEnd),
    ]);

    const monthTrend = this.calcMonthTrend(
      currentMonthSale,
      previousMonthTotalSale,
    );

    return {
      sales: {
        totalSale: this.formatAmount(totalSale),
        previousMonthTotalSale: this.formatAmount(previousMonthTotalSale),
        percentageIncrease: this.calcLifetimeVsPreviousMonthTrend(
          totalSale,
          previousMonthTotalSale,
        ),
      },
      salesView: {
        totalSale: this.formatAmount(totalSale),
        currentMonthSale: this.formatAmount(currentMonthSale),
        todaySale: this.roundAmount(todaySale),
        trend: monthTrend.trend,
        percentageIncrease: monthTrend.percentageIncrease,
      },
    };
  }

  async getThingsToReview(
    tenantDb: DataSource,
    businessId: string | undefined,
    limit = 50,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const perTypeLimit = limit;

    const [
      saleOrders,
      deliveryNotes,
      saleVouchers,
      purchaseOrders,
      grns,
      purchaseVouchers,
      expenseVouchers,
      contraVouchers,
    ] = await Promise.all([
      this.fetchPendingSaleOrders(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingDeliveryNotes(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingSaleVouchers(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingPurchaseOrders(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingGrns(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingPurchaseVouchers(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingExpenseVouchers(tenantDb, scopedBusinessId, perTypeLimit),
      this.fetchPendingContraVouchers(tenantDb, scopedBusinessId, perTypeLimit),
    ]);

    const merged: ReviewRow[] = [
      ...saleOrders,
      ...deliveryNotes,
      ...saleVouchers,
      ...purchaseOrders,
      ...grns,
      ...purchaseVouchers,
      ...expenseVouchers,
      ...contraVouchers,
    ];

    merged.sort(
      (a, b) => b.documentDate.getTime() - a.documentDate.getTime(),
    );

    return {
      data: merged.slice(0, limit).map((row) => ({
        objectType: row.objectType,
        id: row.id,
        documentNumber: row.documentNumber,
        partyName: row.partyName,
        documentDate: row.documentDate.toISOString(),
      })),
    };
  }

  private async fetchPendingSaleOrders(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .innerJoin('so.customer', 'party')
      .select('so.id', 'id')
      .addSelect('so.orderNumber', 'documentNumber')
      .addSelect('so.orderDate', 'documentDate')
      .addSelect('party.name', 'partyName')
      .where('so.businessId = :businessId', { businessId })
      .andWhere('so.orderStatus = :status', { status: OrderStatus.PENDING })
      .orderBy('so.orderDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'SO',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingDeliveryNotes(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(DeliveryNote)
      .createQueryBuilder('dn')
      .innerJoin('dn.customer', 'party')
      .select('dn.id', 'id')
      .addSelect('dn.deliveryNoteNumber', 'documentNumber')
      .addSelect('dn.deliveryNoteDate', 'documentDate')
      .addSelect('party.name', 'partyName')
      .where('dn.businessId = :businessId', { businessId })
      .andWhere('dn.status = :status', { status: DeliveryNoteStatus.PENDING })
      .orderBy('dn.deliveryNoteDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'DN',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingSaleVouchers(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.party', 'party')
      .select('voucher.id', 'id')
      .addSelect('voucher.voucherNumber', 'documentNumber')
      .addSelect('voucher.paymentDate', 'documentDate')
      .addSelect('party.name', 'partyName')
      .where('party.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PENDING })
      .orderBy('voucher.paymentDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'SV',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingPurchaseOrders(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .innerJoin('po.vendor', 'party')
      .select('po.id', 'id')
      .addSelect('po.orderNumber', 'documentNumber')
      .addSelect('po.orderDate', 'documentDate')
      .addSelect('party.name', 'partyName')
      .where('po.businessId = :businessId', { businessId })
      .andWhere('po.orderStatus = :status', { status: OrderStatus.PENDING })
      .orderBy('po.orderDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'PO',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingGrns(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(Grn)
      .createQueryBuilder('grn')
      .innerJoin('grn.vendor', 'party')
      .select('grn.id', 'id')
      .addSelect('grn.grnNumber', 'documentNumber')
      .addSelect('grn.grnDate', 'documentDate')
      .addSelect('party.name', 'partyName')
      .where('grn.businessId = :businessId', { businessId })
      .andWhere('grn.status = :status', { status: GrnStatus.PENDING })
      .orderBy('grn.grnDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'GRN',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingPurchaseVouchers(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(PurchaseVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.party', 'party')
      .select('voucher.id', 'id')
      .addSelect('voucher.voucherNumber', 'documentNumber')
      .addSelect('voucher.paymentDate', 'documentDate')
      .addSelect('party.name', 'partyName')
      .where('party.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PENDING })
      .orderBy('voucher.paymentDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'PV',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingExpenseVouchers(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(ExpenseVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.acc', 'acc')
      .innerJoin('voucher.expenseAcc', 'expenseAcc')
      .select('voucher.id', 'id')
      .addSelect('voucher.voucherNumber', 'documentNumber')
      .addSelect('voucher.paymentDate', 'documentDate')
      .addSelect('expenseAcc.name', 'partyName')
      .where('acc.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PENDING })
      .orderBy('voucher.paymentDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'EV',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  private async fetchPendingContraVouchers(
    tenantDb: DataSource,
    businessId: string,
    take: number,
  ): Promise<ReviewRow[]> {
    const rows = await tenantDb
      .getRepository(ContraVoucher)
      .createQueryBuilder('voucher')
      .innerJoin('voucher.fromAcc', 'fromAcc')
      .select('voucher.id', 'id')
      .addSelect('voucher.voucherNumber', 'documentNumber')
      .addSelect('voucher.paymentDate', 'documentDate')
      .addSelect('fromAcc.name', 'partyName')
      .where('fromAcc.businessId = :businessId', { businessId })
      .andWhere('voucher.status = :status', { status: VoucherStatus.PENDING })
      .orderBy('voucher.paymentDate', 'DESC')
      .take(take)
      .getRawMany<{
        id: string;
        documentNumber: string;
        documentDate: Date;
        partyName: string;
      }>();

    return rows.map((row) => ({
      objectType: 'CV',
      id: row.id,
      documentNumber: row.documentNumber,
      partyName: row.partyName,
      documentDate: new Date(row.documentDate),
    }));
  }

  async getSummary(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const { start: currentStart, end: currentEnd } = this.monthBounds(
      year,
      month,
    );
    const { start: prevStart, end: prevEnd } = this.previousMonthBounds(
      year,
      month,
    );

    const [
      totalCustomers,
      totalVendors,
      totalProducts,
      totalSalesAll,
      totalSalesCurrent,
      totalSalesPrevious,
      totalPurchasesAll,
      totalPurchasesCurrent,
      totalPurchasesPrevious,
      amountReceivedCurrent,
      amountReceivedPrevious,
      salesSnapshot,
      customerBalances,
      vendorBalances,
      topSaleByProduct,
    ] = await Promise.all([
      tenantDb.getRepository(Party).count({
        where: {
          businessId: scopedBusinessId,
          type: In([PartyType.CUSTOMER, PartyType.BOTH]),
          deletedAt: IsNull(),
        },
      }),
      tenantDb.getRepository(Party).count({
        where: {
          businessId: scopedBusinessId,
          type: In([PartyType.VENDOR, PartyType.BOTH]),
          deletedAt: IsNull(),
        },
      }),
      tenantDb.getRepository(Product).count({
        where: { businessId: scopedBusinessId },
      }),
      this.sumSaleInvoices(tenantDb, scopedBusinessId),
      this.sumSaleInvoices(tenantDb, scopedBusinessId, currentStart, currentEnd),
      this.sumSaleInvoices(tenantDb, scopedBusinessId, prevStart, prevEnd),
      this.sumPurchaseInvoices(tenantDb, scopedBusinessId),
      this.sumPurchaseInvoices(
        tenantDb,
        scopedBusinessId,
        currentStart,
        currentEnd,
      ),
      this.sumPurchaseInvoices(
        tenantDb,
        scopedBusinessId,
        prevStart,
        prevEnd,
      ),
      this.sumSaleVouchersPaid(
        tenantDb,
        scopedBusinessId,
        currentStart,
        currentEnd,
      ),
      this.sumSaleVouchersPaid(
        tenantDb,
        scopedBusinessId,
        prevStart,
        prevEnd,
      ),
      this.buildSalesSnapshot(tenantDb, scopedBusinessId),
      this.reportService.getCustomerBalances(
        tenantDb,
        scopedBusinessId,
        actorUserId,
      ),
      this.reportService.getVendorBalances(
        tenantDb,
        scopedBusinessId,
        actorUserId,
      ),
      this.getTopSaleByProduct(
        tenantDb,
        scopedBusinessId,
        currentStart,
        currentEnd,
        10,
      ),
    ]);

    const salesTrend = this.calcMonthTrend(
      totalSalesCurrent,
      totalSalesPrevious,
    );
    const purchasesTrend = this.calcMonthTrend(
      totalPurchasesCurrent,
      totalPurchasesPrevious,
    );
    const receivedTrend = this.calcMonthTrend(
      amountReceivedCurrent,
      amountReceivedPrevious,
    );

    const lowPaymentCustomers = await this.buildLowPaymentCustomers(
      tenantDb,
      scopedBusinessId,
      customerBalances.data,
      10,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DASHBOARD_SUMMARY_VIEWED',
      description: 'Dashboard summary viewed',
    });

    return {
      totalCustomers,
      totalVendors,
      totalProducts,
      totalSales: {
        total: this.formatAmount(totalSalesAll),
        currentMonth: this.formatAmount(totalSalesCurrent),
        previousMonth: this.formatAmount(totalSalesPrevious),
        percentageIncrease: salesTrend.percentageIncrease,
        trend: salesTrend.trend,
      },
      totalPurchases: {
        total: this.formatAmount(totalPurchasesAll),
        currentMonth: this.formatAmount(totalPurchasesCurrent),
        previousMonth: this.formatAmount(totalPurchasesPrevious),
        percentageIncrease: purchasesTrend.percentageIncrease,
        trend: purchasesTrend.trend,
      },
      amountReceived: {
        currentMonth: this.formatAmount(amountReceivedCurrent),
        previousMonth: this.formatAmount(amountReceivedPrevious),
        percentageIncrease: receivedTrend.percentageIncrease,
        trend: receivedTrend.trend,
      },
      receivable: customerBalances.totals.currentBalance,
      payable: vendorBalances.totals.currentBalance,
      sales: salesSnapshot.sales,
      salesView: salesSnapshot.salesView,
      topSaleByProduct,
      lowPaymentCustomers,
    };
  }

  private async getTopSaleByProduct(
    tenantDb: DataSource,
    businessId: string,
    start: Date,
    end: Date,
    limit: number,
  ) {
    const rows = await tenantDb
      .getRepository(SaleInvoiceItem)
      .createQueryBuilder('item')
      .innerJoin('item.saleInvoice', 'invoice')
      .innerJoin('item.product', 'product')
      .select('product.name', 'productName')
      .addSelect('COALESCE(SUM(item.totalAmount), 0)', 'total')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('item.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :start', { start })
      .andWhere('invoice.invoiceDate <= :end', { end })
      .groupBy('product.id')
      .addGroupBy('product.name')
      .orderBy('total', 'DESC')
      .limit(limit)
      .getRawMany<{ productName: string; total: string }>();

    return rows.map((row) => ({
      productName: row.productName,
      total: this.formatAmount(Number(row.total ?? 0)),
    }));
  }

  async getSaleByProduct(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { startDate: string; endDate?: string; limit?: number },
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const start = this.parseDateParam(options.startDate, 'startDate');
    const end = options.endDate
      ? this.parseDateParam(options.endDate, 'endDate')
      : new Date();

    if (start > end) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const data = await this.getTopSaleByProduct(
      tenantDb,
      scopedBusinessId,
      start,
      endOfDay,
      options.limit ?? 10,
    );

    return { data };
  }

  async getLowPaymentCustomers(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
    limit = 10,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const customerBalances = await this.reportService.getCustomerBalances(
      tenantDb,
      scopedBusinessId,
      actorUserId,
    );

    const data = await this.buildLowPaymentCustomers(
      tenantDb,
      scopedBusinessId,
      customerBalances.data,
      limit,
    );

    return { data };
  }

  private async buildLowPaymentCustomers(
    tenantDb: DataSource,
    businessId: string,
    balanceRows: Array<{ id: string; name: string; currentBalance: number }>,
    limit: number,
  ) {
    const candidates = balanceRows
      .filter((row) => row.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance)
      .slice(0, limit);

    if (candidates.length === 0) {
      return [];
    }

    const parties = await tenantDb.getRepository(Party).find({
      where: {
        businessId,
        id: In(candidates.map((row) => row.id)),
      },
      select: { id: true, cityId: true },
    });
    const cityByPartyId = new Map(
      parties.map((party) => [party.id, party.cityId]),
    );

    const cityIds = [
      ...new Set(
        parties
          .map((party) => party.cityId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const cityNames = new Map<string, string | null>();
    await Promise.all(
      cityIds.map(async (cityId) => {
        cityNames.set(
          cityId,
          await this.masterGeoHelperService.getCityNameById(cityId),
        );
      }),
    );

    return candidates.map((row) => {
      const cityId = cityByPartyId.get(row.id) ?? null;
      return {
        name: row.name,
        cityName: cityId ? cityNames.get(cityId) ?? null : null,
        balance: this.formatAmount(row.currentBalance),
      };
    });
  }

  async getCharts(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { startDate: string; endDate?: string },
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const start = this.parseDateParam(options.startDate, 'startDate');
    const end = options.endDate
      ? this.parseDateParam(options.endDate, 'endDate')
      : new Date();

    if (start > end) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const [saleOrder, purchaseOrder, saleByCity] = await Promise.all([
      this.aggregateOrderPie(
        tenantDb,
        scopedBusinessId,
        SaleOrder,
        'so',
        'orderDate',
        start,
        endOfDay,
      ),
      this.aggregateOrderPie(
        tenantDb,
        scopedBusinessId,
        PurchaseOrder,
        'po',
        'orderDate',
        start,
        endOfDay,
      ),
      this.aggregateSaleByCity(
        tenantDb,
        scopedBusinessId,
        start,
        endOfDay,
      ),
    ]);

    return { saleOrder, purchaseOrder, saleByCity };
  }

  private async aggregateOrderPie(
    tenantDb: DataSource,
    businessId: string,
    entity: typeof SaleOrder | typeof PurchaseOrder,
    alias: string,
    dateField: string,
    start: Date,
    end: Date,
  ) {
    const rows = await tenantDb
      .getRepository(entity)
      .createQueryBuilder(alias)
      .select(`${alias}.orderStatus`, 'status')
      .addSelect('COUNT(*)', 'count')
      .where(`${alias}.businessId = :businessId`, { businessId })
      .andWhere(`${alias}.${dateField} >= :start`, { start })
      .andWhere(`${alias}.${dateField} <= :end`, { end })
      .groupBy(`${alias}.orderStatus`)
      .getRawMany<{ status: OrderStatus; count: string }>();

    let complete = 0;
    let pending = 0;
    let canceled = 0;

    for (const row of rows) {
      const count = Number(row.count ?? 0);
      if (row.status === OrderStatus.APPROVED) {
        complete += count;
      } else if (row.status === OrderStatus.PENDING) {
        pending += count;
      } else if (
        row.status === OrderStatus.CANCELLED ||
        row.status === OrderStatus.REJECTED
      ) {
        canceled += count;
      }
    }

    const total = complete + pending + canceled;
    const segments: PieSegment[] = [
      {
        key: 'complete',
        label: 'Complete',
        count: complete,
        percentage:
          total > 0 ? this.roundAmount((complete / total) * 100) : 0,
      },
      {
        key: 'pending',
        label: 'Pending',
        count: pending,
        percentage: total > 0 ? this.roundAmount((pending / total) * 100) : 0,
      },
      {
        key: 'canceled',
        label: 'Canceled',
        count: canceled,
        percentage:
          total > 0 ? this.roundAmount((canceled / total) * 100) : 0,
      },
    ];

    return { total, segments };
  }

  private async aggregateSaleByCity(
    tenantDb: DataSource,
    businessId: string,
    start: Date,
    end: Date,
  ) {
    const rows = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .innerJoin('invoice.customer', 'party')
      .select('party.cityId', 'cityId')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'total')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :start', { start })
      .andWhere('invoice.invoiceDate <= :end', { end })
      .groupBy('party.cityId')
      .orderBy('total', 'DESC')
      .getRawMany<{ cityId: string | null; total: string }>();

    const grandTotal = rows.reduce(
      (sum, row) => sum + Number(row.total ?? 0),
      0,
    );

    const cityIds = rows
      .map((row) => row.cityId)
      .filter((id): id is string => Boolean(id));
    const cityNames = new Map<string, string | null>();
    await Promise.all(
      cityIds.map(async (cityId) => {
        cityNames.set(
          cityId,
          await this.masterGeoHelperService.getCityNameById(cityId),
        );
      }),
    );

    const segments = rows.map((row) => {
      const total = Number(row.total ?? 0);
      return {
        cityId: row.cityId,
        cityName: row.cityId
          ? cityNames.get(row.cityId) ?? 'Unknown'
          : 'Unknown',
        total: this.roundAmount(total),
        percentage:
          grandTotal > 0
            ? this.roundAmount((total / grandTotal) * 100)
            : 0,
      };
    });

    return {
      total: this.roundAmount(grandTotal),
      segments,
    };
  }

  async getAverageOrderValue(
    tenantDb: DataSource,
    businessId: string | undefined,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const { start: todayStart, end: todayEnd } = this.todayBounds();
    const { start: last30Start, end: last30End } = this.rollingDaysBounds(30);
    const { start: last60Start, end: last60End } = this.rollingDaysBounds(60);

    const [
      todayHighest,
      last30Highest,
      last60Highest,
      orders,
    ] = await Promise.all([
      this.getHighestSaleOrderAmount(
        tenantDb,
        scopedBusinessId,
        todayStart,
        todayEnd,
      ),
      this.getHighestSaleOrderAmount(
        tenantDb,
        scopedBusinessId,
        last30Start,
        last30End,
      ),
      this.getHighestSaleOrderAmount(
        tenantDb,
        scopedBusinessId,
        last60Start,
        last60End,
      ),
      this.fetchSaleOrdersForAov(
        tenantDb,
        scopedBusinessId,
        last60Start,
        last60End,
      ),
    ]);

    return {
      today_highest_amount_order: { total_amount: todayHighest },
      last_30_days_highest_amount_order: { total_amount: last30Highest },
      last_60_days_highest_amount_order: { total_amount: last60Highest },
      orders,
    };
  }

  private async getHighestSaleOrderAmount(
    tenantDb: DataSource,
    businessId: string,
    start: Date,
    end: Date,
  ): Promise<string | null> {
    const row = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .select('MAX(so.totalAmount)', 'maxAmount')
      .where('so.businessId = :businessId', { businessId })
      .andWhere('so.orderDate >= :start', { start })
      .andWhere('so.orderDate <= :end', { end })
      .andWhere('so.orderStatus = :status', { status: OrderStatus.APPROVED })
      .getRawOne<{ maxAmount: string | null }>();

    const amount = Number(row?.maxAmount ?? 0);
    return amount > 0 ? this.formatAmount(amount) : null;
  }

  private async fetchSaleOrdersForAov(
    tenantDb: DataSource,
    businessId: string,
    start: Date,
    end: Date,
  ) {
    const rows = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoin('so.customer', 'customer')
      .select('so.id', 'id')
      .addSelect('so.orderNumber', 'orderNumber')
      .addSelect('so.orderDate', 'orderDate')
      .addSelect('so.totalAmount', 'totalAmount')
      .addSelect('so.orderStatus', 'orderStatus')
      .addSelect('customer.name', 'customerName')
      .where('so.businessId = :businessId', { businessId })
      .andWhere('so.orderDate >= :start', { start })
      .andWhere('so.orderDate <= :end', { end })
      .andWhere('so.orderStatus = :status', { status: OrderStatus.APPROVED })
      .orderBy('so.orderDate', 'DESC')
      .addOrderBy('so.createdAt', 'DESC')
      .getRawMany<{
        id: string;
        orderNumber: string;
        orderDate: Date;
        totalAmount: string;
        orderStatus: OrderStatus;
        customerName: string | null;
      }>();

    return rows.map((row) => ({
      id: row.id,
      order_number: row.orderNumber,
      order_date: row.orderDate,
      order_status: row.orderStatus,
      customer_name: row.customerName,
      total_amount: this.formatAmount(Number(row.totalAmount ?? 0)),
    }));
  }

  async getSaleAnalytics(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { date: string; graph_filter: 'daily' | 'weekly' },
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const { year, month } = this.parseYearMonth(options.date);
    const { start, end, lastDay } = this.monthBounds(year, month);

    const [salesGraph, salesData, salesSnapshot] = await Promise.all([
      options.graph_filter === 'weekly'
        ? this.buildWeeklySalesGraph(
            tenantDb,
            scopedBusinessId,
            start,
            end,
            lastDay,
          )
        : this.buildDailySalesGraph(
            tenantDb,
            scopedBusinessId,
            start,
            end,
            lastDay,
          ),
      this.buildMonthlySaleOrderCounts(tenantDb, scopedBusinessId, year),
      this.buildSalesSnapshot(tenantDb, scopedBusinessId),
    ]);

    return {
      salesGraph,
      salesData,
      sales: salesSnapshot.sales,
      salesView: salesSnapshot.salesView,
    };
  }

  private async buildDailySalesGraph(
    tenantDb: DataSource,
    businessId: string,
    start: Date,
    end: Date,
    lastDay: number,
  ) {
    const rows = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .select('EXTRACT(DAY FROM invoice.invoiceDate)', 'day')
      .addSelect('COALESCE(SUM(invoice.totalAmount), 0)', 'total')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :start', { start })
      .andWhere('invoice.invoiceDate <= :end', { end })
      .groupBy('EXTRACT(DAY FROM invoice.invoiceDate)')
      .getRawMany<{ day: string; total: string }>();

    const byDay = new Map<number, number>();
    for (const row of rows) {
      byDay.set(Number(row.day), Number(row.total ?? 0));
    }

    const salesGraph: { day: number; total: string | number }[] = [];
    for (let day = 1; day <= lastDay; day += 1) {
      const amount = byDay.get(day) ?? 0;
      salesGraph.push({
        day,
        total: amount > 0 ? this.formatAmount(amount) : 0,
      });
    }
    return salesGraph;
  }

  private async buildWeeklySalesGraph(
    tenantDb: DataSource,
    businessId: string,
    start: Date,
    end: Date,
    lastDay: number,
  ) {
    const daily = await this.buildDailySalesGraph(
      tenantDb,
      businessId,
      start,
      end,
      lastDay,
    );

    const weekCount = Math.ceil(lastDay / 7);
    const salesGraph: { day: number; total: string | number }[] = [];

    for (let week = 1; week <= weekCount; week += 1) {
      const weekStart = (week - 1) * 7 + 1;
      const weekEnd = Math.min(week * 7, lastDay);
      let sum = 0;
      for (let d = weekStart; d <= weekEnd; d += 1) {
        const point = daily.find((p) => p.day === d);
        const val = point?.total;
        sum += typeof val === 'string' ? Number(val) : Number(val ?? 0);
      }
      salesGraph.push({
        day: week,
        total: sum > 0 ? this.formatAmount(sum) : 0,
      });
    }

    return salesGraph;
  }

  private async buildMonthlySaleOrderCounts(
    tenantDb: DataSource,
    businessId: string,
    year: number,
  ): Promise<{
    totalSaleOrderPending: MonthYearCount[];
    totalSaleOrderApproved: MonthYearCount[];
    totalSaleOrderDelivered: MonthYearCount[];
  }> {
    const [pending, approved] = await Promise.all([
      this.countSaleOrdersByMonth(
        tenantDb,
        businessId,
        year,
        OrderStatus.PENDING,
      ),
      this.countSaleOrdersByMonth(
        tenantDb,
        businessId,
        year,
        OrderStatus.APPROVED,
      ),
    ]);

    return {
      totalSaleOrderPending: pending,
      totalSaleOrderApproved: approved,
      totalSaleOrderDelivered: approved,
    };
  }

  private async countSaleOrdersByMonth(
    tenantDb: DataSource,
    businessId: string,
    year: number,
    status: OrderStatus,
  ): Promise<MonthYearCount[]> {
    const rows = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .select('EXTRACT(MONTH FROM so.orderDate)', 'month')
      .addSelect('EXTRACT(YEAR FROM so.orderDate)', 'year')
      .addSelect('COUNT(so.id)', 'count')
      .where('so.businessId = :businessId', { businessId })
      .andWhere('so.orderStatus = :status', { status })
      .andWhere('EXTRACT(YEAR FROM so.orderDate) = :year', { year })
      .groupBy('EXTRACT(MONTH FROM so.orderDate)')
      .addGroupBy('EXTRACT(YEAR FROM so.orderDate)')
      .orderBy('year', 'ASC')
      .addOrderBy('month', 'ASC')
      .getRawMany<{ month: string; year: string; count: string }>();

    return rows.map((row) => ({
      month: Number(row.month),
      year: Number(row.year),
      count: Number(row.count ?? 0),
    }));
  }
}
