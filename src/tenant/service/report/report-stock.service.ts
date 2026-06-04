import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Batch, StockBalance, StockMovement } from 'src/tenant-db/entities/stock.entity';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import {
  applyWarehouseFilter,
  createCountQuery,
  resolveInventoryScope,
} from '../inventory/inventory-query.helper';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  endOfDay,
  parseDateRange,
  resolvePagination,
  roundAmount,
} from './report-query.helper';

@Injectable()
export class ReportStockService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getStockSummary(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      scope?: InventoryScope;
      warehouseId?: string;
      productId?: string;
      uomId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { scope, warehouseId } = resolveInventoryScope({
      scope: options.scope,
      warehouseId: options.warehouseId,
    });
    const { page, limit, skip } = resolvePagination(options.page, options.limit);

    const baseQb = tenantDb
      .getRepository(StockBalance)
      .createQueryBuilder('balance')
      .innerJoin('balance.product', 'product')
      .innerJoin('balance.warehouse', 'warehouse')
      .leftJoin('balance.uom', 'uom')
      .where('balance.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('balance.deletedAt IS NULL')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('warehouse.deletedAt IS NULL');

    applyWarehouseFilter(baseQb, 'balance', scope, warehouseId);

    if (options.productId) {
      baseQb.andWhere('balance.productId = :productId', {
        productId: options.productId,
      });
    }
    if (options.uomId) {
      baseQb.andWhere('balance.uomId = :uomId', { uomId: options.uomId });
    }
    if (options.search?.trim()) {
      baseQb.andWhere('product.name ILIKE :search', {
        search: `%${options.search.trim()}%`,
      });
    }

    const countRow = await createCountQuery(baseQb, 'COUNT(balance.id)').getRawOne<{
      total: string;
    }>();

    const rows = await baseQb
      .clone()
      .select('balance.warehouseId', 'warehouseId')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('warehouse.code', 'warehouseCode')
      .addSelect('balance.productId', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'productSkuCode')
      .addSelect('balance.uomId', 'uomId')
      .addSelect('uom.name', 'uomName')
      .addSelect('balance.quantityAvailable', 'quantityAvailable')
      .addSelect('balance.quantityOnHand', 'quantityOnHand')
      .addSelect('balance.quantityReserved', 'quantityReserved')
      .addSelect('balance.quantityDamaged', 'quantityDamaged')
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const data = rows.map((row) => ({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      warehouseCode: row.warehouseCode,
      productId: row.productId,
      productName: row.productName,
      productSkuCode: row.productSkuCode,
      uomId: row.uomId,
      uomName: row.uomName,
      quantityAvailable: Number(row.quantityAvailable),
      quantityOnHand: Number(row.quantityOnHand),
      quantityReserved: Number(row.quantityReserved),
      quantityDamaged: Number(row.quantityDamaged),
    }));

    const totals = data.reduce(
      (sum, row) => {
        sum.quantityOnHand += row.quantityOnHand;
        sum.quantityAvailable += row.quantityAvailable;
        sum.quantityReserved += row.quantityReserved;
        sum.quantityDamaged += row.quantityDamaged;
        return sum;
      },
      {
        quantityOnHand: 0,
        quantityAvailable: 0,
        quantityReserved: 0,
        quantityDamaged: 0,
      },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_SUMMARY_REPORT_VIEWED',
      description: 'Stock summary report viewed',
      metadata: { count: data.length, scope },
    });

    return {
      data,
      totals: {
        quantityOnHand: roundAmount(totals.quantityOnHand),
        quantityAvailable: roundAmount(totals.quantityAvailable),
        quantityReserved: roundAmount(totals.quantityReserved),
        quantityDamaged: roundAmount(totals.quantityDamaged),
      },
      meta: {
        total: Number(countRow?.total ?? 0),
        page,
        limit,
        scope,
      },
    };
  }

  async getStockMovements(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      scope?: InventoryScope;
      warehouseId?: string;
      productId?: string;
      uomId?: string;
      movementType?: string;
      referenceType?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { scope, warehouseId } = resolveInventoryScope({
      scope: options.scope,
      warehouseId: options.warehouseId,
    });
    const { startDate, endDate } = parseDateRange(options.startDate, options.endDate);
    const { page, limit, skip } = resolvePagination(options.page, options.limit);

    const qb = tenantDb
      .getRepository(StockMovement)
      .createQueryBuilder('movement')
      .innerJoin('movement.product', 'product')
      .innerJoin('movement.warehouse', 'warehouse')
      .leftJoin('movement.uom', 'uom')
      .where('movement.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('movement.deletedAt IS NULL')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('warehouse.deletedAt IS NULL');

    applyWarehouseFilter(qb, 'movement', scope, warehouseId);

    if (options.productId) {
      qb.andWhere('movement.productId = :productId', { productId: options.productId });
    }
    if (options.uomId) {
      qb.andWhere('movement.uomId = :uomId', { uomId: options.uomId });
    }
    if (options.movementType) {
      qb.andWhere('movement.movementType = :movementType', {
        movementType: options.movementType,
      });
    }
    if (options.referenceType) {
      qb.andWhere('movement.referenceType = :referenceType', {
        referenceType: options.referenceType,
      });
    }
    if (startDate) {
      qb.andWhere('movement.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('movement.createdAt <= :endDate', { endDate: endOfDay(endDate) });
    }
    if (options.search?.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${options.search.trim()}%`,
      });
    }

    const countRow = await createCountQuery(qb, 'COUNT(movement.id)').getRawOne<{
      total: string;
    }>();

    const rows = await qb
      .clone()
      .select('movement.id', 'id')
      .addSelect('movement.warehouseId', 'warehouseId')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('warehouse.code', 'warehouseCode')
      .addSelect('movement.productId', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'productSkuCode')
      .addSelect('movement.uomId', 'uomId')
      .addSelect('uom.name', 'uomName')
      .addSelect('movement.movementType', 'movementType')
      .addSelect('movement.referenceType', 'referenceType')
      .addSelect('movement.quantity', 'quantity')
      .addSelect('movement.createdAt', 'createdAt')
      .orderBy('movement.createdAt', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_MOVEMENT_REPORT_VIEWED',
      description: 'Stock movement report viewed',
      metadata: { count: rows.length, scope },
    });

    return {
      period: {
        startDate: options.startDate ?? null,
        endDate: options.endDate ?? null,
      },
      data: rows.map((row) => ({
        id: row.id,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        warehouseCode: row.warehouseCode,
        productId: row.productId,
        productName: row.productName,
        productSkuCode: row.productSkuCode,
        uomId: row.uomId,
        uomName: row.uomName,
        movementType: row.movementType,
        referenceType: row.referenceType,
        quantity: Number(row.quantity),
        createdAt: row.createdAt,
      })),
      meta: {
        total: Number(countRow?.total ?? 0),
        page,
        limit,
        scope,
      },
    };
  }

  async getStockValuation(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      scope?: InventoryScope;
      warehouseId?: string;
      productId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { scope, warehouseId } = resolveInventoryScope({
      scope: options.scope,
      warehouseId: options.warehouseId,
    });
    const { page, limit, skip } = resolvePagination(options.page, options.limit);

    const qb = tenantDb
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .innerJoin('batch.product', 'product')
      .innerJoin('batch.warehouse', 'warehouse')
      .leftJoin('batch.uom', 'uom')
      .where('batch.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('batch.deletedAt IS NULL')
      .andWhere('batch.quantity > 0')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('warehouse.deletedAt IS NULL');

    applyWarehouseFilter(qb, 'batch', scope, warehouseId);

    if (options.productId) {
      qb.andWhere('batch.productId = :productId', { productId: options.productId });
    }
    if (options.search?.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${options.search.trim()}%`,
      });
    }

    const grouped = qb
      .clone()
      .select('batch.warehouseId', 'warehouseId')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('batch.productId', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'productSkuCode')
      .addSelect('batch.uomId', 'uomId')
      .addSelect('uom.name', 'uomName')
      .addSelect('COALESCE(SUM(batch.quantity), 0)', 'quantity')
      .addSelect(
        'COALESCE(SUM(batch.quantity * batch.purchaseUnitPrice), 0)',
        'stockValue',
      )
      .addSelect(
        `CASE WHEN COALESCE(SUM(batch.quantity), 0) > 0 THEN COALESCE(SUM(batch.quantity * batch.purchaseUnitPrice), 0) / COALESCE(SUM(batch.quantity), 0) ELSE 0 END`,
        'averageUnitCost',
      )
      .groupBy('batch.warehouseId')
      .addGroupBy('warehouse.name')
      .addGroupBy('batch.productId')
      .addGroupBy('product.name')
      .addGroupBy('product.skuCode')
      .addGroupBy('batch.uomId')
      .addGroupBy('uom.name');

    const countRow = await tenantDb
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(`(${grouped.getQuery()})`, 'valuation')
      .setParameters(grouped.getParameters())
      .getRawOne<{ total: string }>();

    const rows = await grouped
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('product.name', 'ASC')
      .offset(skip)
      .limit(limit)
      .getRawMany<{
        warehouseId: string;
        warehouseName: string;
        productId: string;
        productName: string;
        productSkuCode: string;
        uomId: string;
        uomName: string | null;
        quantity: string;
        stockValue: string;
        averageUnitCost: string;
      }>();

    const data = rows.map((row) => ({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      productId: row.productId,
      productName: row.productName,
      productSkuCode: row.productSkuCode,
      uomId: row.uomId,
      uomName: row.uomName,
      quantity: Number(row.quantity),
      averageUnitCost: roundAmount(Number(row.averageUnitCost)),
      stockValue: roundAmount(Number(row.stockValue)),
    }));

    const totals = data.reduce(
      (sum, row) => {
        sum.quantity = roundAmount(sum.quantity + row.quantity);
        sum.stockValue = roundAmount(sum.stockValue + row.stockValue);
        return sum;
      },
      { quantity: 0, stockValue: 0 },
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_VALUATION_REPORT_VIEWED',
      description: 'Stock valuation report viewed',
      metadata: { count: data.length, totalStockValue: totals.stockValue },
    });

    return {
      data,
      totals,
      meta: {
        total: Number(countRow?.total ?? 0),
        page,
        limit,
        scope,
      },
    };
  }
}
