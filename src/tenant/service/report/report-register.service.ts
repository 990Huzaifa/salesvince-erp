import { BadRequestException, Injectable } from '@nestjs/common';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { SaleOrder } from 'src/tenant-db/entities/sale-order.entity';
import {
  DeliveryNote,
} from 'src/tenant-db/entities/delivery-note.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseOrder } from 'src/tenant-db/entities/purchase-order.entity';
import { Grn } from 'src/tenant-db/entities/grn.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { SaleVoucher } from 'src/tenant-db/entities/sale-voucher.entity';
import { PurchaseVoucher } from 'src/tenant-db/entities/purchase-voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { ReportRegisterDocumentType } from 'src/tenant/dto/report/report-register.query.dto';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  resolvePagination,
  roundAmount,
  startOfDay,
} from './report-query.helper';

type RegisterFilters = {
  startDate?: string;
  endDate?: string;
  partyId?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
};

type RegisterRow = {
  id: string;
  documentNumber: string;
  documentDate: Date;
  status: string;
  partyId: string | null;
  partyCode: string | null;
  partyName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  referenceNumber: string | null;
  totalAmount: number;
  createdAt: Date;
};

@Injectable()
export class ReportRegisterService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getRegister(
    tenantDb: DataSource,
    businessId: string | undefined,
    documentType: ReportRegisterDocumentType,
    filters: RegisterFilters,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { startDate, endDate } = parseDateRange(filters.startDate, filters.endDate);
    const { page, limit, skip } = resolvePagination(filters.page, filters.limit);

    const handlers: Record<
      ReportRegisterDocumentType,
      () => Promise<{ rows: RegisterRow[]; total: number }>
    > = {
      [ReportRegisterDocumentType.SALE_ORDER]: () =>
        this.fetchSaleOrderRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.DELIVERY_NOTE]: () =>
        this.fetchDeliveryNoteRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.SALE_INVOICE]: () =>
        this.fetchSaleInvoiceRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.PURCHASE_ORDER]: () =>
        this.fetchPurchaseOrderRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.GRN]: () =>
        this.fetchGrnRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.PURCHASE_INVOICE]: () =>
        this.fetchPurchaseInvoiceRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.SALE_VOUCHER]: () =>
        this.fetchSaleVoucherRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
      [ReportRegisterDocumentType.PURCHASE_VOUCHER]: () =>
        this.fetchPurchaseVoucherRegister(tenantDb, scopedBusinessId, filters, startDate, endDate, skip, limit),
    };

    const handler = handlers[documentType];
    if (!handler) {
      throw new BadRequestException('Unsupported register document type');
    }

    const { rows, total } = await handler();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DOCUMENT_REGISTER_REPORT_VIEWED',
      description: 'Document register report viewed',
      metadata: { documentType, total, page, limit },
    });

    return {
      documentType,
      period: {
        startDate: filters.startDate ?? null,
        endDate: filters.endDate ?? null,
      },
      filters: {
        partyId: filters.partyId ?? null,
        warehouseId: filters.warehouseId ?? null,
        status: filters.status ?? null,
        search: filters.search ?? null,
      },
      data: rows,
      meta: { total, page, limit },
    };
  }

  private applyDateFilters(
    qb: ReturnType<DataSource['createQueryBuilder']>,
    alias: string,
    dateField: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    if (startDate) {
      qb.andWhere(`${alias}.${dateField} >= :startDate`, {
        startDate: startOfDay(startDate),
      });
    }
    if (endDate) {
      qb.andWhere(`${alias}.${dateField} <= :endDate`, {
        endDate: endOfDay(endDate),
      });
    }
  }

  private applySearch(
    qb: ReturnType<DataSource['createQueryBuilder']>,
    fields: string[],
    search?: string,
  ) {
    if (!search?.trim()) {
      return;
    }
    const term = `%${search.trim()}%`;
    qb.andWhere(
      new Brackets((sub) => {
        for (const field of fields) {
          sub.orWhere(`${field} ILIKE :search`, { search: term });
        }
      }),
    );
  }

  private async fetchSaleOrderRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('doc')
      .leftJoin('doc.customer', 'party')
      .where('doc.businessId = :businessId', { businessId });

    if (filters.partyId) {
      qb.andWhere('doc.customerId = :partyId', { partyId: filters.partyId });
    }
    if (filters.status) {
      qb.andWhere('doc.orderStatus = :status', { status: filters.status });
    }
    this.applyDateFilters(qb, 'doc', 'orderDate', startDate, endDate);
    this.applySearch(qb, ['doc.orderNumber', 'party.name', 'party.code'], filters.search);

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.orderNumber AS "documentNumber"',
        'doc.orderDate AS "documentDate"',
        'doc.orderStatus AS status',
        'doc.customerId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'doc.totalAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.orderDate', 'DESC')
      .addOrderBy('doc.createdAt', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow>();

    return {
      rows: rows.map((row) => this.mapRegisterRow(row, null, null)),
      total,
    };
  }

  private async fetchDeliveryNoteRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(DeliveryNote)
      .createQueryBuilder('doc')
      .leftJoin('doc.customer', 'party')
      .leftJoin('doc.saleOrder', 'saleOrder')
      .where('doc.businessId = :businessId', { businessId });

    if (filters.partyId) {
      qb.andWhere('doc.customerId = :partyId', { partyId: filters.partyId });
    }
    if (filters.status) {
      qb.andWhere('doc.status = :status', { status: filters.status });
    }
    this.applyDateFilters(qb, 'doc', 'deliveryNoteDate', startDate, endDate);
    this.applySearch(
      qb,
      ['doc.deliveryNoteNumber', 'party.name', 'party.code', 'saleOrder.orderNumber'],
      filters.search,
    );

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.deliveryNoteNumber AS "documentNumber"',
        'doc.deliveryNoteDate AS "documentDate"',
        'doc.status AS status',
        'doc.customerId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'saleOrder.orderNumber AS "referenceNumber"',
        'doc.totalAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.deliveryNoteDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow & { referenceNumber: string | null }>();

    return {
      rows: rows.map((row) =>
        this.mapRegisterRow(row, null, row.referenceNumber),
      ),
      total,
    };
  }

  private async fetchSaleInvoiceRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('doc')
      .leftJoin('doc.customer', 'party')
      .leftJoin('doc.deliveryNote', 'deliveryNote')
      .where('doc.businessId = :businessId', { businessId })
      .andWhere('doc.deletedAt IS NULL');

    if (filters.partyId) {
      qb.andWhere('doc.customerId = :partyId', { partyId: filters.partyId });
    }
    this.applyDateFilters(qb, 'doc', 'invoiceDate', startDate, endDate);
    this.applySearch(
      qb,
      ['doc.invoiceNumber', 'party.name', 'party.code', 'deliveryNote.deliveryNoteNumber'],
      filters.search,
    );

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.invoiceNumber AS "documentNumber"',
        'doc.invoiceDate AS "documentDate"',
        `'INVOICED' AS "status"`,
        'doc.customerId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'deliveryNote.deliveryNoteNumber AS "referenceNumber"',
        'doc.totalAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.invoiceDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow & { referenceNumber: string | null }>();

    return {
      rows: rows.map((row) =>
        this.mapRegisterRow(row, null, row.referenceNumber),
      ),
      total,
    };
  }

  private async fetchPurchaseOrderRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('doc')
      .leftJoin('doc.vendor', 'party')
      .leftJoin('doc.warehouse', 'warehouse')
      .where('doc.businessId = :businessId', { businessId });

    if (filters.partyId) {
      qb.andWhere('doc.vendorId = :partyId', { partyId: filters.partyId });
    }
    if (filters.warehouseId) {
      qb.andWhere('doc.warehouseId = :warehouseId', {
        warehouseId: filters.warehouseId,
      });
    }
    if (filters.status) {
      qb.andWhere('doc.orderStatus = :status', { status: filters.status });
    }
    this.applyDateFilters(qb, 'doc', 'orderDate', startDate, endDate);
    this.applySearch(qb, ['doc.orderNumber', 'party.name', 'party.code'], filters.search);

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.orderNumber AS "documentNumber"',
        'doc.orderDate AS "documentDate"',
        'doc.orderStatus AS status',
        'doc.vendorId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'doc.warehouseId AS "warehouseId"',
        'warehouse.name AS "warehouseName"',
        'doc.totalAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.orderDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow & { warehouseId: string; warehouseName: string }>();

    return {
      rows: rows.map((row) =>
        this.mapRegisterRow(row, row.warehouseId, null, row.warehouseName),
      ),
      total,
    };
  }

  private async fetchGrnRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(Grn)
      .createQueryBuilder('doc')
      .leftJoin('doc.vendor', 'party')
      .leftJoin('doc.warehouse', 'warehouse')
      .leftJoin('doc.purchaseOrder', 'purchaseOrder')
      .where('doc.businessId = :businessId', { businessId });

    if (filters.partyId) {
      qb.andWhere('doc.vendorId = :partyId', { partyId: filters.partyId });
    }
    if (filters.warehouseId) {
      qb.andWhere('doc.warehouseId = :warehouseId', {
        warehouseId: filters.warehouseId,
      });
    }
    if (filters.status) {
      qb.andWhere('doc.status = :status', { status: filters.status });
    }
    this.applyDateFilters(qb, 'doc', 'grnDate', startDate, endDate);
    this.applySearch(
      qb,
      ['doc.grnNumber', 'party.name', 'party.code', 'purchaseOrder.orderNumber'],
      filters.search,
    );

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.grnNumber AS "documentNumber"',
        'doc.grnDate AS "documentDate"',
        'doc.status AS status',
        'doc.vendorId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'doc.warehouseId AS "warehouseId"',
        'warehouse.name AS "warehouseName"',
        'purchaseOrder.orderNumber AS "referenceNumber"',
        'doc.totalAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.grnDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<
        RegisterRow & {
          warehouseId: string;
          warehouseName: string;
          referenceNumber: string | null;
        }
      >();

    return {
      rows: rows.map((row) =>
        this.mapRegisterRow(
          row,
          row.warehouseId,
          row.referenceNumber,
          row.warehouseName,
        ),
      ),
      total,
    };
  }

  private async fetchPurchaseInvoiceRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('doc')
      .leftJoin('doc.vendor', 'party')
      .leftJoin('doc.grn', 'grn')
      .where('doc.businessId = :businessId', { businessId })
      .andWhere('doc.deletedAt IS NULL');

    if (filters.partyId) {
      qb.andWhere('doc.vendorId = :partyId', { partyId: filters.partyId });
    }
    this.applyDateFilters(qb, 'doc', 'invoiceDate', startDate, endDate);
    this.applySearch(
      qb,
      ['doc.invoiceNumber', 'party.name', 'party.code', 'grn.grnNumber'],
      filters.search,
    );

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.invoiceNumber AS "documentNumber"',
        'doc.invoiceDate AS "documentDate"',
        `'INVOICED' AS "status"`,
        'doc.vendorId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'grn.grnNumber AS "referenceNumber"',
        'doc.totalAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.invoiceDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow & { referenceNumber: string | null }>();

    return {
      rows: rows.map((row) =>
        this.mapRegisterRow(row, null, row.referenceNumber),
      ),
      total,
    };
  }

  private async fetchSaleVoucherRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(SaleVoucher)
      .createQueryBuilder('doc')
      .leftJoin('doc.party', 'party')
      .where('party.businessId = :businessId', { businessId });

    if (filters.partyId) {
      qb.andWhere('doc.partyId = :partyId', { partyId: filters.partyId });
    }
    if (filters.status) {
      qb.andWhere('doc.status = :status', { status: filters.status });
    }
    this.applyDateFilters(qb, 'doc', 'paymentDate', startDate, endDate);
    this.applySearch(qb, ['doc.voucherNumber', 'party.name', 'party.code'], filters.search);

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.voucherNumber AS "documentNumber"',
        'doc.paymentDate AS "documentDate"',
        'doc.status AS status',
        'doc.partyId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'doc.paymentAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.paymentDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow>();

    return {
      rows: rows.map((row) => this.mapRegisterRow(row, null, null)),
      total,
    };
  }

  private async fetchPurchaseVoucherRegister(
    tenantDb: DataSource,
    businessId: string,
    filters: RegisterFilters,
    startDate?: Date,
    endDate?: Date,
    skip?: number,
    limit?: number,
  ) {
    const qb = tenantDb
      .getRepository(PurchaseVoucher)
      .createQueryBuilder('doc')
      .leftJoin('doc.party', 'party')
      .where('party.businessId = :businessId', { businessId });

    if (filters.partyId) {
      qb.andWhere('doc.partyId = :partyId', { partyId: filters.partyId });
    }
    if (filters.status) {
      qb.andWhere('doc.status = :status', { status: filters.status });
    }
    this.applyDateFilters(qb, 'doc', 'paymentDate', startDate, endDate);
    this.applySearch(qb, ['doc.voucherNumber', 'party.name', 'party.code'], filters.search);

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'doc.id AS id',
        'doc.voucherNumber AS "documentNumber"',
        'doc.paymentDate AS "documentDate"',
        'doc.status AS status',
        'doc.partyId AS "partyId"',
        'party.code AS "partyCode"',
        'party.name AS "partyName"',
        'doc.paymentAmount AS "totalAmount"',
        'doc.createdAt AS "createdAt"',
      ])
      .orderBy('doc.paymentDate', 'DESC')
      .offset(skip ?? 0)
      .limit(limit ?? 25)
      .getRawMany<RegisterRow>();

    return {
      rows: rows.map((row) => this.mapRegisterRow(row, null, null)),
      total,
    };
  }

  private mapRegisterRow(
    row: RegisterRow,
    warehouseId: string | null,
    referenceNumber: string | null,
    warehouseName: string | null = null,
  ): RegisterRow {
    return {
      id: row.id,
      documentNumber: row.documentNumber,
      documentDate: row.documentDate,
      status: String(row.status),
      partyId: row.partyId ?? null,
      partyCode: row.partyCode ?? null,
      partyName: row.partyName ?? null,
      warehouseId,
      warehouseName,
      referenceNumber,
      totalAmount: roundAmount(Number(row.totalAmount ?? 0)),
      createdAt: row.createdAt,
    };
  }
}
