import { Injectable } from '@nestjs/common';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { PurchaseQuotation } from 'src/tenant-db/entities/purchase-quotation.entity';
import {
  OrderStatus,
  PurchaseOrder,
} from 'src/tenant-db/entities/purchase-order.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { PurchaseReturn } from 'src/tenant-db/entities/purchase-return.entity';
import { SaleQuotation } from 'src/tenant-db/entities/sale-quotation.entity';
import { SaleOrder } from 'src/tenant-db/entities/sale-order.entity';
import {
  DeliveryNote,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleReturn } from 'src/tenant-db/entities/sale-return.entity';
import { PurchaseVoucher } from 'src/tenant-db/entities/purchase-voucher.entity';
import { PurchaseReturnVoucher } from 'src/tenant-db/entities/purchase-return-voucher.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import { SaleReturnVoucher } from 'src/tenant-db/entities/sale-return-voucher.entity';
import { VoucherStatus } from 'src/tenant-db/entities/voucher.entity';

export type TrendSignal = 0 | 1;

export interface AnalyticsMetric {
  total: number;
  currentMonth: number;
  previousMonth: number;
  percentageIncrease: number;
  trend: TrendSignal;
}

export interface DocumentListAnalytics {
  totalOrders: AnalyticsMetric;
  totalApprovedOrders: AnalyticsMetric;
  totalPendingOrder: AnalyticsMetric;
}

export interface VoucherListAnalytics {
  totalVouchers: AnalyticsMetric;
  approved: AnalyticsMetric;
  pending: AnalyticsMetric;
}

export enum ListAnalyticsModule {
  PURCHASE_QUOTATION = 'PURCHASE_QUOTATION',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  GRN = 'GRN',
  PURCHASE_INVOICE = 'PURCHASE_INVOICE',
  PURCHASE_RETURN = 'PURCHASE_RETURN',
  SALE_QUOTATION = 'SALE_QUOTATION',
  SALE_ORDER = 'SALE_ORDER',
  DELIVERY_NOTE = 'DELIVERY_NOTE',
  SALE_INVOICE = 'SALE_INVOICE',
  SALE_RETURN = 'SALE_RETURN',
  PURCHASE_VOUCHER = 'PURCHASE_VOUCHER',
  PURCHASE_RETURN_VOUCHER = 'PURCHASE_RETURN_VOUCHER',
  SALE_VOUCHER = 'SALE_VOUCHER',
  SALE_RETURN_VOUCHER = 'SALE_RETURN_VOUCHER',
}

type CountSnapshot = {
  total: number;
  approved: number;
  pending: number;
};

type DocumentAnalyticsConfig = {
  entity: EntityTarget<ObjectLiteral>;
  alias: string;
  dateField: string;
  statusField?: string;
  approvedValue?: string;
  pendingValue?: string;
  softDelete?: boolean;
  partyScoped?: boolean;
};

const DOCUMENT_CONFIGS: Record<
  Exclude<
    ListAnalyticsModule,
    | ListAnalyticsModule.PURCHASE_VOUCHER
    | ListAnalyticsModule.PURCHASE_RETURN_VOUCHER
    | ListAnalyticsModule.SALE_VOUCHER
    | ListAnalyticsModule.SALE_RETURN_VOUCHER
  >,
  DocumentAnalyticsConfig
> = {
  [ListAnalyticsModule.PURCHASE_QUOTATION]: {
    entity: PurchaseQuotation,
    alias: 'doc',
    dateField: 'quotationDate',
  },
  [ListAnalyticsModule.PURCHASE_ORDER]: {
    entity: PurchaseOrder,
    alias: 'doc',
    dateField: 'orderDate',
    statusField: 'orderStatus',
    approvedValue: OrderStatus.APPROVED,
    pendingValue: OrderStatus.PENDING,
  },
  [ListAnalyticsModule.GRN]: {
    entity: Grn,
    alias: 'doc',
    dateField: 'grnDate',
    statusField: 'status',
    approvedValue: GrnStatus.APPROVED,
    pendingValue: GrnStatus.PENDING,
    softDelete: true,
  },
  [ListAnalyticsModule.PURCHASE_INVOICE]: {
    entity: PurchaseInvoice,
    alias: 'doc',
    dateField: 'invoiceDate',
    softDelete: true,
  },
  [ListAnalyticsModule.PURCHASE_RETURN]: {
    entity: PurchaseReturn,
    alias: 'doc',
    dateField: 'returnDate',
    statusField: 'status',
    approvedValue: 'APPROVED',
    pendingValue: 'PENDING',
  },
  [ListAnalyticsModule.SALE_QUOTATION]: {
    entity: SaleQuotation,
    alias: 'doc',
    dateField: 'quotationDate',
  },
  [ListAnalyticsModule.SALE_ORDER]: {
    entity: SaleOrder,
    alias: 'doc',
    dateField: 'orderDate',
    statusField: 'orderStatus',
    approvedValue: OrderStatus.APPROVED,
    pendingValue: OrderStatus.PENDING,
  },
  [ListAnalyticsModule.DELIVERY_NOTE]: {
    entity: DeliveryNote,
    alias: 'doc',
    dateField: 'deliveryNoteDate',
    statusField: 'status',
    approvedValue: DeliveryNoteStatus.APPROVED,
    pendingValue: DeliveryNoteStatus.PENDING,
  },
  [ListAnalyticsModule.SALE_INVOICE]: {
    entity: SaleInvoice,
    alias: 'doc',
    dateField: 'invoiceDate',
    softDelete: true,
  },
  [ListAnalyticsModule.SALE_RETURN]: {
    entity: SaleReturn,
    alias: 'doc',
    dateField: 'returnDate',
    statusField: 'status',
    approvedValue: 'APPROVED',
    pendingValue: 'PENDING',
  },
};

const VOUCHER_CONFIGS: Record<
  | ListAnalyticsModule.PURCHASE_VOUCHER
  | ListAnalyticsModule.PURCHASE_RETURN_VOUCHER
  | ListAnalyticsModule.SALE_VOUCHER
  | ListAnalyticsModule.SALE_RETURN_VOUCHER,
  DocumentAnalyticsConfig
> = {
  [ListAnalyticsModule.PURCHASE_VOUCHER]: {
    entity: PurchaseVoucher,
    alias: 'doc',
    dateField: 'paymentDate',
    statusField: 'status',
    approvedValue: VoucherStatus.PAID,
    pendingValue: VoucherStatus.PENDING,
    partyScoped: true,
  },
  [ListAnalyticsModule.PURCHASE_RETURN_VOUCHER]: {
    entity: PurchaseReturnVoucher,
    alias: 'doc',
    dateField: 'paymentDate',
    statusField: 'status',
    approvedValue: VoucherStatus.PAID,
    pendingValue: VoucherStatus.PENDING,
    partyScoped: true,
  },
  [ListAnalyticsModule.SALE_VOUCHER]: {
    entity: SaleVoucher,
    alias: 'doc',
    dateField: 'paymentDate',
    statusField: 'status',
    approvedValue: VoucherStatus.PAID,
    pendingValue: VoucherStatus.PENDING,
    partyScoped: true,
  },
  [ListAnalyticsModule.SALE_RETURN_VOUCHER]: {
    entity: SaleReturnVoucher,
    alias: 'doc',
    dateField: 'paymentDate',
    statusField: 'status',
    approvedValue: VoucherStatus.PAID,
    pendingValue: VoucherStatus.PENDING,
    partyScoped: true,
  },
};

@Injectable()
export class ListAnalyticsService {
  private monthBounds(
    year: number,
    month: number,
  ): { start: Date; end: Date } {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { start, end };
  }

  private previousMonthBounds(year: number, month: number): {
    start: Date;
    end: Date;
  } {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return this.monthBounds(prevYear, prevMonth);
  }

  private calcMonthTrend(
    current: number,
    previous: number,
  ): Pick<AnalyticsMetric, 'percentageIncrease' | 'trend'> {
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

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private buildMetric(
    total: number,
    currentMonth: number,
    previousMonth: number,
  ): AnalyticsMetric {
    const trend = this.calcMonthTrend(currentMonth, previousMonth);
    return {
      total,
      currentMonth,
      previousMonth,
      percentageIncrease: trend.percentageIncrease,
      trend: trend.trend,
    };
  }

  private applyBusinessScope(
    qb: ReturnType<DataSource['createQueryBuilder']>,
    alias: string,
    businessId: string,
    partyScoped?: boolean,
  ) {
    if (partyScoped) {
      qb.innerJoin(`${alias}.party`, 'party').where(
        'party.businessId = :businessId',
        { businessId },
      );
      return;
    }

    qb.where(`${alias}.businessId = :businessId`, { businessId });
  }

  private async countSnapshot(
    tenantDb: DataSource,
    businessId: string,
    config: DocumentAnalyticsConfig,
    dateStart?: Date,
    dateEnd?: Date,
  ): Promise<CountSnapshot> {
    const alias = config.alias;
    const qb = tenantDb
      .getRepository(config.entity)
      .createQueryBuilder(alias);

    this.applyBusinessScope(qb, alias, businessId, config.partyScoped);

    if (config.softDelete) {
      qb.andWhere(`${alias}.deletedAt IS NULL`);
    }

    if (dateStart) {
      qb.andWhere(`${alias}.${config.dateField} >= :dateStart`, { dateStart });
    }
    if (dateEnd) {
      qb.andWhere(`${alias}.${config.dateField} <= :dateEnd`, { dateEnd });
    }

    if (!config.statusField) {
      const total = await qb.getCount();
      return { total, approved: total, pending: 0 };
    }

    const [total, approved, pending] = await Promise.all([
      qb.clone().getCount(),
      qb
        .clone()
        .andWhere(`${alias}.${config.statusField} = :approvedValue`, {
          approvedValue: config.approvedValue,
        })
        .getCount(),
      qb
        .clone()
        .andWhere(`${alias}.${config.statusField} = :pendingValue`, {
          pendingValue: config.pendingValue,
        })
        .getCount(),
    ]);

    return { total, approved, pending };
  }

  private async buildDocumentAnalytics(
    tenantDb: DataSource,
    businessId: string,
    config: DocumentAnalyticsConfig,
  ): Promise<DocumentListAnalytics> {
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

    const [allTime, currentMonth, previousMonth] = await Promise.all([
      this.countSnapshot(tenantDb, businessId, config),
      this.countSnapshot(tenantDb, businessId, config, currentStart, currentEnd),
      this.countSnapshot(tenantDb, businessId, config, prevStart, prevEnd),
    ]);

    return {
      totalOrders: this.buildMetric(
        allTime.total,
        currentMonth.total,
        previousMonth.total,
      ),
      totalApprovedOrders: this.buildMetric(
        allTime.approved,
        currentMonth.approved,
        previousMonth.approved,
      ),
      totalPendingOrder: this.buildMetric(
        allTime.pending,
        currentMonth.pending,
        previousMonth.pending,
      ),
    };
  }

  private async buildVoucherAnalytics(
    tenantDb: DataSource,
    businessId: string,
    config: DocumentAnalyticsConfig,
  ): Promise<VoucherListAnalytics> {
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

    const [allTime, currentMonth, previousMonth] = await Promise.all([
      this.countSnapshot(tenantDb, businessId, config),
      this.countSnapshot(tenantDb, businessId, config, currentStart, currentEnd),
      this.countSnapshot(tenantDb, businessId, config, prevStart, prevEnd),
    ]);

    return {
      totalVouchers: this.buildMetric(
        allTime.total,
        currentMonth.total,
        previousMonth.total,
      ),
      approved: this.buildMetric(
        allTime.approved,
        currentMonth.approved,
        previousMonth.approved,
      ),
      pending: this.buildMetric(
        allTime.pending,
        currentMonth.pending,
        previousMonth.pending,
      ),
    };
  }

  async getDocumentAnalytics(
    tenantDb: DataSource,
    businessId: string,
    module: Exclude<
      ListAnalyticsModule,
      | ListAnalyticsModule.PURCHASE_VOUCHER
      | ListAnalyticsModule.PURCHASE_RETURN_VOUCHER
      | ListAnalyticsModule.SALE_VOUCHER
      | ListAnalyticsModule.SALE_RETURN_VOUCHER
    >,
  ): Promise<DocumentListAnalytics> {
    return this.buildDocumentAnalytics(
      tenantDb,
      businessId,
      DOCUMENT_CONFIGS[module],
    );
  }

  async getVoucherAnalytics(
    tenantDb: DataSource,
    businessId: string,
    module:
      | ListAnalyticsModule.PURCHASE_VOUCHER
      | ListAnalyticsModule.PURCHASE_RETURN_VOUCHER
      | ListAnalyticsModule.SALE_VOUCHER
      | ListAnalyticsModule.SALE_RETURN_VOUCHER,
  ): Promise<VoucherListAnalytics> {
    return this.buildVoucherAnalytics(
      tenantDb,
      businessId,
      VOUCHER_CONFIGS[module],
    );
  }

  async getVoucherAnalyticsByActivityKey(
    tenantDb: DataSource,
    businessId: string,
    activityKey: string,
  ): Promise<VoucherListAnalytics | null> {
    const moduleMap: Record<string, ListAnalyticsModule> = {
      PURCHASE_VOUCHER: ListAnalyticsModule.PURCHASE_VOUCHER,
      PURCHASE_RETURN_VOUCHER: ListAnalyticsModule.PURCHASE_RETURN_VOUCHER,
      SALE_VOUCHER: ListAnalyticsModule.SALE_VOUCHER,
      SALE_RETURN_VOUCHER: ListAnalyticsModule.SALE_RETURN_VOUCHER,
    };
    const module = moduleMap[activityKey];
    if (!module) {
      return null;
    }
    return this.getVoucherAnalytics(tenantDb, businessId, module as any);
  }
}
