import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  OrderStatus,
  SaleOrder,
} from 'src/tenant-db/entities/sale-order.entity';
import {
  PaymentMethod,
  VoucherStatus,
} from 'src/tenant-db/entities/voucher.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { PrebookingPaymentStatusFilter } from 'src/tenant/dto/report/report-prebooking.query.dto';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type PrebookingReportFilters = {
  startDate?: Date;
  endDate?: Date;
  paymentStatus: PrebookingPaymentStatusFilter;
  customerId?: string;
  cityId?: string;
  warehouseId?: string;
  search?: string;
};

type OrderRow = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  cityId: string | null;
  orderStatus: OrderStatus;
  orderDate: Date;
  totalAmount: number;
};

type VoucherRow = {
  id: string;
  partyId: string;
  paymentDate: Date;
  paymentAmount: number;
  paymentMethod: PaymentMethod;
};

type AllocatedOrder = OrderRow & {
  advanceAllocated: number;
  outstanding: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  ageDays: number;
};

type MonthKey = string;

@Injectable()
export class ReportPrebookingService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getPrebookingReport(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      startDate?: string;
      endDate?: string;
      paymentStatus?: PrebookingPaymentStatusFilter;
      customerId?: string;
      cityId?: string;
      warehouseId?: string;
      search?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );

    const filters: PrebookingReportFilters = {
      startDate,
      endDate,
      paymentStatus:
        options.paymentStatus ?? PrebookingPaymentStatusFilter.ALL,
      customerId: options.customerId?.trim() || undefined,
      cityId: options.cityId?.trim() || undefined,
      warehouseId: options.warehouseId?.trim() || undefined,
      search: options.search?.trim() || undefined,
    };

    const orders = await this.fetchPrebookOrders(
      tenantDb,
      scopedBusinessId,
      filters,
    );

    const orderCustomerIds = new Set(orders.map((o) => o.customerId));
    let vouchers = await this.fetchPrebookingVouchers(
      tenantDb,
      scopedBusinessId,
      filters,
    );

    // When warehouse/search narrows orders, keep advances for those customers only.
    if (filters.warehouseId || filters.search) {
      vouchers = vouchers.filter((v) => orderCustomerIds.has(v.partyId));
    }

    const asOf = endDate ? endOfDay(endDate) : new Date();
    let allocated = this.allocateAdvances(orders, vouchers, asOf);

    if (filters.paymentStatus !== PrebookingPaymentStatusFilter.ALL) {
      allocated = allocated.filter(
        (row) => row.paymentStatus === filters.paymentStatus,
      );
    }

    const useAllocatedAdvance =
      filters.paymentStatus !== PrebookingPaymentStatusFilter.ALL;
    const summary = this.buildSummary(
      allocated,
      vouchers,
      useAllocatedAdvance,
    );
    const monthlyTrend = this.buildMonthlyTrend(allocated, vouchers);
    const collection = this.buildCollection(allocated, vouchers);
    const analytics = this.buildAnalytics(allocated);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PREBOOKING_REPORT_VIEWED',
      description: 'Prebooking report viewed',
      metadata: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        paymentStatus: filters.paymentStatus,
        customerId: filters.customerId ?? null,
        cityId: filters.cityId ?? null,
        warehouseId: filters.warehouseId ?? null,
        search: filters.search ?? null,
        orderCount: allocated.length,
      },
    });

    return {
      filters: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
        paymentStatus: filters.paymentStatus,
        customerId: filters.customerId ?? null,
        cityId: filters.cityId ?? null,
        warehouseId: filters.warehouseId ?? null,
        search: filters.search ?? null,
      },
      summary,
      monthlyTrend,
      collection,
      analytics,
    };
  }

  private async fetchPrebookOrders(
    tenantDb: DataSource,
    businessId: string,
    filters: PrebookingReportFilters,
  ): Promise<OrderRow[]> {
    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .innerJoinAndSelect('so.customer', 'customer')
      .where('so.businessId = :businessId', { businessId })
      .andWhere('so.isPrebooking = true')
      .andWhere('so.orderStatus NOT IN (:...excluded)', {
        excluded: [OrderStatus.CANCELLED, OrderStatus.REJECTED],
      });

    if (filters.startDate) {
      qb.andWhere('so.orderDate >= :startDate', {
        startDate: startOfDay(filters.startDate),
      });
    }
    if (filters.endDate) {
      qb.andWhere('so.orderDate <= :endDate', {
        endDate: endOfDay(filters.endDate),
      });
    }
    if (filters.customerId) {
      qb.andWhere('so.customerId = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.cityId) {
      qb.andWhere('customer.cityId = :cityId', { cityId: filters.cityId });
    }
    if (filters.warehouseId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM sale_order_items soi
          WHERE soi."saleOrderId" = so.id
            AND soi."warehouseId" = :warehouseId
        )`,
        { warehouseId: filters.warehouseId },
      );
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      qb.andWhere(
        `(
          so.orderNumber ILIKE :term
          OR customer.name ILIKE :term
          OR customer.code ILIKE :term
          OR EXISTS (
            SELECT 1 FROM sale_order_items soi
            INNER JOIN products p ON p.id = soi."productId"
            WHERE soi."saleOrderId" = so.id
              AND p.name ILIKE :term
          )
        )`,
        { term },
      );
    }

    const rows = await qb
      .orderBy('so.orderDate', 'ASC')
      .addOrderBy('so.createdAt', 'ASC')
      .getMany();

    return rows.map((so) => ({
      id: so.id,
      orderNumber: so.orderNumber,
      customerId: so.customerId,
      customerName: so.customer?.name ?? '',
      customerCode: so.customer?.code ?? '',
      cityId: so.customer?.cityId ?? null,
      orderStatus: so.orderStatus,
      orderDate: so.orderDate,
      totalAmount: roundAmount(Number(so.totalAmount ?? 0)),
    }));
  }

  private async fetchPrebookingVouchers(
    tenantDb: DataSource,
    businessId: string,
    filters: PrebookingReportFilters,
  ): Promise<VoucherRow[]> {
    const qb = tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('sv')
      .innerJoin('sv.party', 'party')
      .where('party.businessId = :businessId', { businessId })
      .andWhere('sv.isPrebooking = true')
      .andWhere('sv.status = :status', { status: VoucherStatus.PAID });

    if (filters.startDate) {
      qb.andWhere('sv.paymentDate >= :startDate', {
        startDate: startOfDay(filters.startDate),
      });
    }
    if (filters.endDate) {
      qb.andWhere('sv.paymentDate <= :endDate', {
        endDate: endOfDay(filters.endDate),
      });
    }
    if (filters.customerId) {
      qb.andWhere('sv.partyId = :customerId', {
        customerId: filters.customerId,
      });
    }
    if (filters.cityId) {
      qb.andWhere('party.cityId = :cityId', { cityId: filters.cityId });
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      qb.andWhere(
        `(
          sv.voucherNumber ILIKE :term
          OR party.name ILIKE :term
          OR party.code ILIKE :term
        )`,
        { term },
      );
    }

    const rows = await qb
      .orderBy('sv.paymentDate', 'ASC')
      .addOrderBy('sv.createdAt', 'ASC')
      .getMany();

    return rows.map((sv) => ({
      id: sv.id,
      partyId: sv.partyId,
      paymentDate: sv.paymentDate,
      paymentAmount: roundAmount(Number(sv.paymentAmount ?? 0)),
      paymentMethod: sv.paymentMethod,
    }));
  }

  private allocateAdvances(
    orders: OrderRow[],
    vouchers: VoucherRow[],
    asOf: Date,
  ): AllocatedOrder[] {
    const remainingByCustomer = new Map<string, number>();
    for (const voucher of vouchers) {
      remainingByCustomer.set(
        voucher.partyId,
        roundAmount(
          (remainingByCustomer.get(voucher.partyId) ?? 0) +
            voucher.paymentAmount,
        ),
      );
    }

    const asOfTime = asOf.getTime();

    return orders.map((order) => {
      const remaining = remainingByCustomer.get(order.customerId) ?? 0;
      const advanceAllocated = roundAmount(
        Math.min(remaining, order.totalAmount),
      );
      remainingByCustomer.set(
        order.customerId,
        roundAmount(remaining - advanceAllocated),
      );

      const outstanding = roundAmount(order.totalAmount - advanceAllocated);
      let paymentStatus: AllocatedOrder['paymentStatus'] = 'UNPAID';
      if (advanceAllocated <= 0) {
        paymentStatus = 'UNPAID';
      } else if (outstanding <= 0) {
        paymentStatus = 'PAID';
      } else {
        paymentStatus = 'PARTIAL';
      }

      const orderTime = new Date(order.orderDate).getTime();
      const ageDays = Math.max(
        0,
        Math.floor((asOfTime - orderTime) / (1000 * 60 * 60 * 24)),
      );

      return {
        ...order,
        advanceAllocated,
        outstanding,
        paymentStatus,
        ageDays,
      };
    });
  }

  private buildSummary(
    orders: AllocatedOrder[],
    vouchers: VoucherRow[],
    useAllocatedAdvance = false,
  ) {
    const prebookOrders = orders.length;
    const fulfilled = orders.filter(
      (o) => o.orderStatus === OrderStatus.APPROVED,
    ).length;
    const orderValue = roundAmount(
      orders.reduce((sum, o) => sum + o.totalAmount, 0),
    );
    const advanceCollected = roundAmount(
      useAllocatedAdvance
        ? orders.reduce((sum, o) => sum + o.advanceAllocated, 0)
        : vouchers.reduce((sum, v) => sum + v.paymentAmount, 0),
    );
    const outstanding = roundAmount(
      orders.reduce((sum, o) => sum + o.outstanding, 0),
    );
    const collectionRate =
      orderValue > 0
        ? roundAmount((advanceCollected / orderValue) * 100)
        : 0;
    const unpaidOrders = orders.filter(
      (o) => o.paymentStatus === 'UNPAID',
    ).length;

    return {
      prebookOrders: {
        value: prebookOrders,
        fulfilled,
        label: 'Prebook Orders',
        subtitle: `${fulfilled} fulfilled`,
      },
      orderValue: {
        value: orderValue,
        label: 'Order Value',
        subtitle: 'Booked amount',
      },
      advanceCollected: {
        value: advanceCollected,
        label: 'Advance Collected',
        subtitle: 'Total prebook payments',
      },
      outstanding: {
        value: outstanding,
        label: 'Outstanding',
        subtitle: 'Balance after advances',
      },
      collectionRate: {
        value: collectionRate,
        label: 'Collection Rate',
        subtitle: 'Advance ÷ order value',
        unit: 'percent' as const,
      },
      unpaidOrders: {
        value: unpaidOrders,
        label: 'Unpaid Orders',
        subtitle: 'Zero advance received',
      },
    };
  }

  private buildMonthlyTrend(orders: AllocatedOrder[], vouchers: VoucherRow[]) {
    const monthMap = new Map<
      MonthKey,
      { orderValue: number; advanceCollected: number }
    >();

    const ensure = (key: MonthKey) => {
      if (!monthMap.has(key)) {
        monthMap.set(key, { orderValue: 0, advanceCollected: 0 });
      }
      return monthMap.get(key)!;
    };

    for (const order of orders) {
      const bucket = ensure(monthKeyFromDate(order.orderDate));
      bucket.orderValue = roundAmount(bucket.orderValue + order.totalAmount);
    }
    for (const voucher of vouchers) {
      const bucket = ensure(monthKeyFromDate(voucher.paymentDate));
      bucket.advanceCollected = roundAmount(
        bucket.advanceCollected + voucher.paymentAmount,
      );
    }

    const months = [...monthMap.keys()].sort();
    return {
      title: 'Monthly Prebooking Trend',
      subtitle: 'Order value vs advance collected',
      series: {
        orderValue: months.map((month) => ({
          month,
          label: formatMonthLabel(month),
          value: monthMap.get(month)!.orderValue,
        })),
        advanceCollected: months.map((month) => ({
          month,
          label: formatMonthLabel(month),
          value: monthMap.get(month)!.advanceCollected,
        })),
      },
    };
  }

  private buildCollection(orders: AllocatedOrder[], vouchers: VoucherRow[]) {
    const monthMap = new Map<
      MonthKey,
      { advanceCollected: number; outstanding: number }
    >();

    const ensure = (key: MonthKey) => {
      if (!monthMap.has(key)) {
        monthMap.set(key, { advanceCollected: 0, outstanding: 0 });
      }
      return monthMap.get(key)!;
    };

    for (const voucher of vouchers) {
      const bucket = ensure(monthKeyFromDate(voucher.paymentDate));
      bucket.advanceCollected = roundAmount(
        bucket.advanceCollected + voucher.paymentAmount,
      );
    }
    for (const order of orders) {
      const bucket = ensure(monthKeyFromDate(order.orderDate));
      bucket.outstanding = roundAmount(bucket.outstanding + order.outstanding);
    }

    const months = [...monthMap.keys()].sort();

    const methodTotals = new Map<PaymentMethod, number>();
    for (const voucher of vouchers) {
      methodTotals.set(
        voucher.paymentMethod,
        roundAmount(
          (methodTotals.get(voucher.paymentMethod) ?? 0) +
            voucher.paymentAmount,
        ),
      );
    }
    const methodTotal = roundAmount(
      [...methodTotals.values()].reduce((sum, v) => sum + v, 0),
    );

    const paymentMethods = Object.values(PaymentMethod)
      .map((method) => {
        const amount = methodTotals.get(method) ?? 0;
        return {
          method,
          label: paymentMethodLabel(method),
          amount,
          percentage:
            methodTotal > 0 ? roundAmount((amount / methodTotal) * 100) : 0,
        };
      })
      .filter((row) => row.amount > 0);

    return {
      monthlyCollection: {
        title: 'Monthly Collection',
        subtitle: 'Advance in vs remaining outstanding',
        series: {
          advanceCollected: months.map((month) => ({
            month,
            label: formatMonthLabel(month),
            value: monthMap.get(month)!.advanceCollected,
          })),
          outstanding: months.map((month) => ({
            month,
            label: formatMonthLabel(month),
            value: monthMap.get(month)!.outstanding,
          })),
        },
      },
      paymentMethods: {
        title: 'Payment Methods',
        subtitle: 'Advance share by channel',
        total: methodTotal,
        items: paymentMethods,
      },
    };
  }

  private buildAnalytics(orders: AllocatedOrder[]) {
    const byCustomer = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerCode: string;
        advancePaid: number;
        outstanding: number;
      }
    >();

    for (const order of orders) {
      const existing = byCustomer.get(order.customerId) ?? {
        customerId: order.customerId,
        customerName: order.customerName,
        customerCode: order.customerCode,
        advancePaid: 0,
        outstanding: 0,
      };
      existing.advancePaid = roundAmount(
        existing.advancePaid + order.advanceAllocated,
      );
      existing.outstanding = roundAmount(
        existing.outstanding + order.outstanding,
      );
      byCustomer.set(order.customerId, existing);
    }

    const topCustomers = [...byCustomer.values()]
      .sort((a, b) => b.advancePaid - a.advancePaid)
      .slice(0, 10);

    const agingBuckets = [
      { key: '0_15', label: '0–15 days', min: 0, max: 15 },
      { key: '16_30', label: '16–30 days', min: 16, max: 30 },
      { key: '31_60', label: '31–60 days', min: 31, max: 60 },
      {
        key: '60_plus',
        label: '60+ days',
        min: 61,
        max: Number.POSITIVE_INFINITY,
      },
    ] as const;

    const outstandingAging = agingBuckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      amount: roundAmount(
        orders
          .filter(
            (o) =>
              o.outstanding > 0 &&
              o.ageDays >= bucket.min &&
              o.ageDays <= bucket.max,
          )
          .reduce((sum, o) => sum + o.outstanding, 0),
      ),
    }));

    const unpaid = orders.filter((o) => o.paymentStatus === 'UNPAID').length;
    const partial = orders.filter((o) => o.paymentStatus === 'PARTIAL').length;
    const paid = orders.filter((o) => o.paymentStatus === 'PAID').length;

    return {
      topCustomers: {
        title: 'Top Customers',
        subtitle: 'Highest advance collectors',
        items: topCustomers,
      },
      outstandingAging: {
        title: 'Outstanding Aging',
        subtitle: 'Unpaid / partial by age',
        items: outstandingAging,
      },
      statusSummary: {
        title: 'Status Summary',
        unpaid,
        partial,
        paid,
        total: unpaid + partial + paid,
      },
    };
  }
}

function monthKeyFromDate(value: Date): MonthKey {
  const d = new Date(value);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: MonthKey): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case PaymentMethod.CASH:
      return 'Cash';
    case PaymentMethod.TRANSFER:
      return 'Bank Transfer';
    case PaymentMethod.CHEQUE:
      return 'Cheque';
    case PaymentMethod.ONLINE:
      return 'Card';
    case PaymentMethod.OTHER:
    default:
      return 'Other';
  }
}
