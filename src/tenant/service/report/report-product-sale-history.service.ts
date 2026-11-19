import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, IsNull, SelectQueryBuilder } from 'typeorm';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { Product } from 'src/tenant-db/entities/product.entity';
import { SaleInvoiceItem } from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleItemType } from 'src/tenant-db/entities/sale-item-type';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  resolvePagination,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type ProductSaleHistoryOptions = {
  productId?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  recordActivity?: boolean;
};

type ProductSaleHistoryRow = {
  id: string;
  saleDate: string;
  voucherId: string;
  voucherCode: string;
  productId: string;
  productCode: string;
  productName: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  quantity: number;
  unit: string | null;
  rate: number;
  amount: number;
};

type CustomerWiseRow = {
  customerId: string;
  customerCode: string;
  customerName: string;
  saleCount: number;
  quantity: number;
  amount: number;
  lastSaleDate: string | null;
};

type ProductWiseRow = {
  productId: string;
  productCode: string;
  productName: string;
  saleCount: number;
  quantity: number;
  amount: number;
  lastSaleDate: string | null;
};

type ProductSaleHistoryTotals = {
  saleCount: number;
  totalQuantity: number;
  totalAmount: number;
  uniqueCustomers: number;
  uniqueProducts: number;
};

@Injectable()
export class ReportProductSaleHistoryService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getProductSaleHistory(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: ProductSaleHistoryOptions,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(
      options.startDate,
      options.endDate,
    );
    const productId = options.productId?.trim() || undefined;
    const customerId = options.customerId?.trim() || undefined;

    if (productId) {
      await this.assertProduct(tenantDb, scopedBusinessId, productId);
    }
    if (customerId) {
      await this.assertCustomerParty(tenantDb, scopedBusinessId, customerId);
    }

    const filters = { productId, customerId, startDate, endDate };
    const { page, limit, skip } = resolvePagination(options.page, options.limit);

    const [totals, customerWise, productWise, rawRows] = await Promise.all([
      this.fetchTotals(tenantDb, scopedBusinessId, filters),
      this.fetchCustomerWise(tenantDb, scopedBusinessId, filters),
      this.fetchProductWise(tenantDb, scopedBusinessId, filters),
      this.fetchRows(tenantDb, scopedBusinessId, filters, skip, limit),
    ]);

    const rows = rawRows.map((row) => this.mapRow(row));

    if (options.recordActivity !== false) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: actorUserId,
        businessId: scopedBusinessId,
        action: 'PRODUCT_SALE_HISTORY_REPORT_VIEWED',
        description: 'Product sale history report viewed',
        metadata: {
          productId: productId ?? null,
          customerId: customerId ?? null,
          startDate: options.startDate ?? null,
          endDate: options.endDate ?? null,
          totals,
        },
      });
    }

    return {
      filters: {
        productId: productId ?? null,
        customerId: customerId ?? null,
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      totals,
      customerWise,
      productWise,
      rows,
      meta: {
        page,
        limit,
        total: totals.saleCount,
        lastPage: Math.max(1, Math.ceil(totals.saleCount / limit) || 1),
      },
    };
  }

  private createBaseQuery(
    tenantDb: DataSource,
    businessId: string,
  ): SelectQueryBuilder<SaleInvoiceItem> {
    return tenantDb
      .getRepository(SaleInvoiceItem)
      .createQueryBuilder('item')
      .innerJoin('item.saleInvoice', 'invoice')
      .innerJoin('invoice.customer', 'customer')
      .innerJoin('item.product', 'product')
      .leftJoin('item.uom', 'uom')
      .where('invoice.businessId = :businessId', { businessId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('item.deletedAt IS NULL')
      .andWhere('item.itemType = :itemType', {
        itemType: SaleItemType.PRODUCT,
      })
      .andWhere('item.productId IS NOT NULL');
  }

  private applyFilters(
    qb: SelectQueryBuilder<SaleInvoiceItem>,
    filters: {
      productId?: string;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): void {
    if (filters.productId) {
      qb.andWhere('item.productId = :productId', {
        productId: filters.productId,
      });
    }
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
  }

  private async fetchTotals(
    tenantDb: DataSource,
    businessId: string,
    filters: {
      productId?: string;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<ProductSaleHistoryTotals> {
    const qb = this.createBaseQuery(tenantDb, businessId)
      .select('COUNT(item.id)', 'saleCount')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'totalQuantity')
      .addSelect('COALESCE(SUM(item.totalAmount), 0)', 'totalAmount')
      .addSelect('COUNT(DISTINCT invoice.customerId)', 'uniqueCustomers')
      .addSelect('COUNT(DISTINCT item.productId)', 'uniqueProducts');
    this.applyFilters(qb, filters);

    const row = await qb.getRawOne<{
      saleCount: string;
      totalQuantity: string;
      totalAmount: string;
      uniqueCustomers: string;
      uniqueProducts: string;
    }>();

    return {
      saleCount: Number(row?.saleCount ?? 0),
      totalQuantity: roundAmount(Number(row?.totalQuantity ?? 0)),
      totalAmount: roundAmount(Number(row?.totalAmount ?? 0)),
      uniqueCustomers: Number(row?.uniqueCustomers ?? 0),
      uniqueProducts: Number(row?.uniqueProducts ?? 0),
    };
  }

  private async fetchCustomerWise(
    tenantDb: DataSource,
    businessId: string,
    filters: {
      productId?: string;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<CustomerWiseRow[]> {
    const qb = this.createBaseQuery(tenantDb, businessId)
      .select('customer.id', 'customerId')
      .addSelect('customer.code', 'customerCode')
      .addSelect('customer.name', 'customerName')
      .addSelect('COUNT(item.id)', 'saleCount')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(item.totalAmount), 0)', 'amount')
      .addSelect('MAX(invoice.invoiceDate)', 'lastSaleDate')
      .groupBy('customer.id')
      .addGroupBy('customer.code')
      .addGroupBy('customer.name')
      .orderBy('COALESCE(SUM(item.totalAmount), 0)', 'DESC')
      .addOrderBy('customer.name', 'ASC');
    this.applyFilters(qb, filters);

    const rows = await qb.getRawMany<{
      customerId: string;
      customerCode: string;
      customerName: string;
      saleCount: string;
      quantity: string;
      amount: string;
      lastSaleDate: Date | string | null;
    }>();

    return rows.map((row) => ({
      customerId: row.customerId,
      customerCode: row.customerCode,
      customerName: row.customerName,
      saleCount: Number(row.saleCount ?? 0),
      quantity: roundAmount(Number(row.quantity ?? 0)),
      amount: roundAmount(Number(row.amount ?? 0)),
      lastSaleDate: this.formatDateOnly(row.lastSaleDate),
    }));
  }

  private async fetchProductWise(
    tenantDb: DataSource,
    businessId: string,
    filters: {
      productId?: string;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<ProductWiseRow[]> {
    const qb = this.createBaseQuery(tenantDb, businessId)
      .select('product.id', 'productId')
      .addSelect('product.skuCode', 'productCode')
      .addSelect('product.name', 'productName')
      .addSelect('COUNT(item.id)', 'saleCount')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(item.totalAmount), 0)', 'amount')
      .addSelect('MAX(invoice.invoiceDate)', 'lastSaleDate')
      .groupBy('product.id')
      .addGroupBy('product.skuCode')
      .addGroupBy('product.name')
      .orderBy('COALESCE(SUM(item.totalAmount), 0)', 'DESC')
      .addOrderBy('product.name', 'ASC');
    this.applyFilters(qb, filters);

    const rows = await qb.getRawMany<{
      productId: string;
      productCode: string;
      productName: string;
      saleCount: string;
      quantity: string;
      amount: string;
      lastSaleDate: Date | string | null;
    }>();

    return rows.map((row) => ({
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      saleCount: Number(row.saleCount ?? 0),
      quantity: roundAmount(Number(row.quantity ?? 0)),
      amount: roundAmount(Number(row.amount ?? 0)),
      lastSaleDate: this.formatDateOnly(row.lastSaleDate),
    }));
  }

  private async fetchRows(
    tenantDb: DataSource,
    businessId: string,
    filters: {
      productId?: string;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    skip: number,
    limit: number,
  ) {
    const qb = this.createBaseQuery(tenantDb, businessId)
      .select('item.id', 'id')
      .addSelect('invoice.invoiceDate', 'saleDate')
      .addSelect('invoice.id', 'voucherId')
      .addSelect('invoice.invoiceNumber', 'voucherCode')
      .addSelect('product.id', 'productId')
      .addSelect('product.skuCode', 'productCode')
      .addSelect('product.name', 'productName')
      .addSelect('customer.id', 'customerId')
      .addSelect('customer.code', 'customerCode')
      .addSelect('customer.name', 'customerName')
      .addSelect('item.quantity', 'quantity')
      .addSelect('uom.name', 'unit')
      .addSelect('item.saleUnitPrice', 'rate')
      .addSelect('item.totalAmount', 'amount')
      .orderBy('invoice.invoiceDate', 'DESC')
      .addOrderBy('invoice.createdAt', 'DESC')
      .addOrderBy('item.createdAt', 'DESC')
      .offset(skip)
      .limit(limit);
    this.applyFilters(qb, filters);

    return qb.getRawMany<{
      id: string;
      saleDate: Date | string;
      voucherId: string;
      voucherCode: string;
      productId: string;
      productCode: string;
      productName: string;
      customerId: string;
      customerCode: string;
      customerName: string;
      quantity: string;
      unit: string | null;
      rate: string;
      amount: string;
    }>();
  }

  private mapRow(row: {
    id: string;
    saleDate: Date | string;
    voucherId: string;
    voucherCode: string;
    productId: string;
    productCode: string;
    productName: string;
    customerId: string;
    customerCode: string;
    customerName: string;
    quantity: string;
    unit: string | null;
    rate: string;
    amount: string;
  }): ProductSaleHistoryRow {
    return {
      id: row.id,
      saleDate: this.formatDateOnly(row.saleDate) ?? '',
      voucherId: row.voucherId,
      voucherCode: row.voucherCode,
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      customerId: row.customerId,
      customerCode: row.customerCode,
      customerName: row.customerName,
      quantity: roundAmount(Number(row.quantity ?? 0)),
      unit: row.unit ?? null,
      rate: roundAmount(Number(row.rate ?? 0)),
      amount: roundAmount(Number(row.amount ?? 0)),
    };
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

  private async assertProduct(
    tenantDb: DataSource,
    businessId: string,
    productId: string,
  ): Promise<Product> {
    const product = await tenantDb.getRepository(Product).findOne({
      where: { id: productId, businessId },
    });
    if (!product) {
      throw new BadRequestException('Product not found');
    }
    return product;
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
        'Party type is not valid for product sale history report',
      );
    }

    return party;
  }
}
