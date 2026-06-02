import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StockMovement } from 'src/tenant-db/entities/stock.entity';
import { GetStockMovementDto } from 'src/tenant/dto/inventory/get-stock-movement.dto';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import {
  applyWarehouseFilter,
  assertBusinessId,
  assertDateRange,
  resolveInventoryScope,
} from './inventory-query.helper';

@Injectable()
export class InventoryMovementService {
  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: GetStockMovementDto,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { scope, warehouseId } = resolveInventoryScope(dto);
    assertDateRange(dto.fromDate, dto.toDate);

    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.max(1, Number(dto.limit ?? 10));
    const skip = (page - 1) * limit;

    if (scope === InventoryScope.AUTO) {
      const qb = tenantDb
        .getRepository(StockMovement)
        .createQueryBuilder('movement')
        .innerJoin('movement.product', 'product')
        .leftJoin('movement.uom', 'uom')
        .where('movement.businessId = :businessId', { businessId: scopedBusinessId })
        .andWhere('movement.deletedAt IS NULL')
        .andWhere('product.isDelete = false')
        .andWhere('product.isActive = true');

      if (dto.productId) {
        qb.andWhere('movement.productId = :productId', {
          productId: dto.productId,
        });
      }
      if (dto.uomId) {
        qb.andWhere('movement.uomId = :uomId', { uomId: dto.uomId });
      }
      if (dto.movementType) {
        qb.andWhere('movement.movementType = :movementType', {
          movementType: dto.movementType,
        });
      }
      if (dto.referenceType) {
        qb.andWhere('movement.referenceType = :referenceType', {
          referenceType: dto.referenceType,
        });
      }
      if (dto.fromDate) {
        qb.andWhere('movement.createdAt >= :fromDate', { fromDate: dto.fromDate });
      }
      if (dto.toDate) {
        qb.andWhere('movement.createdAt <= :toDate', { toDate: dto.toDate });
      }
      if (dto.search?.trim()) {
        qb.andWhere('product.name ILIKE :search', {
          search: `%${dto.search.trim()}%`,
        });
      }

      const rows = await qb
        .select('movement.productId', 'productId')
        .addSelect('product.name', 'productName')
        .addSelect('product.skuCode', 'productSkuCode')
        .addSelect('movement.uomId', 'uomId')
        .addSelect('uom.name', 'uomName')
        .addSelect('movement.movementType', 'movementType')
        .addSelect('movement.referenceType', 'referenceType')
        .addSelect('COUNT(movement.id)', 'movementCount')
        .addSelect('COALESCE(SUM(movement.quantity), 0)', 'quantity')
        .groupBy('movement.productId')
        .addGroupBy('product.name')
        .addGroupBy('product.skuCode')
        .addGroupBy('movement.uomId')
        .addGroupBy('uom.name')
        .addGroupBy('movement.movementType')
        .addGroupBy('movement.referenceType')
        .orderBy('product.name', 'ASC')
        .addOrderBy('uom.name', 'ASC')
        .offset(skip)
        .limit(limit)
        .getRawMany<{
          productId: string;
          productName: string;
          productSkuCode: string;
          uomId: string;
          uomName: string | null;
          movementType: string;
          referenceType: string;
          movementCount: string;
          quantity: string;
        }>();

      const countRow = await qb
        .clone()
        .select(
          'COUNT(DISTINCT CONCAT(movement.productId, \':\', movement.uomId, \':\', movement.movementType, \':\', movement.referenceType))',
          'total',
        )
        .offset(undefined)
        .limit(undefined)
        .getRawOne<{ total: string }>();

      return {
        data: rows.map((row) => ({
          productId: row.productId,
          productName: row.productName,
          productSkuCode: row.productSkuCode,
          uomId: row.uomId,
          uomName: row.uomName,
          movementType: row.movementType,
          referenceType: row.referenceType,
          movementCount: Number(row.movementCount),
          quantity: Number(row.quantity),
        })),
        meta: { total: Number(countRow?.total ?? 0), page, limit, scope },
      };
    }

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

    if (dto.productId) {
      qb.andWhere('movement.productId = :productId', {
        productId: dto.productId,
      });
    }
    if (dto.uomId) {
      qb.andWhere('movement.uomId = :uomId', { uomId: dto.uomId });
    }
    if (dto.movementType) {
      qb.andWhere('movement.movementType = :movementType', {
        movementType: dto.movementType,
      });
    }
    if (dto.referenceType) {
      qb.andWhere('movement.referenceType = :referenceType', {
        referenceType: dto.referenceType,
      });
    }
    if (dto.fromDate) {
      qb.andWhere('movement.createdAt >= :fromDate', { fromDate: dto.fromDate });
    }
    if (dto.toDate) {
      qb.andWhere('movement.createdAt <= :toDate', { toDate: dto.toDate });
    }
    if (dto.search?.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${dto.search.trim()}%`,
      });
    }

    const rows = await qb
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
      .getRawMany<{
        id: string;
        warehouseId: string;
        warehouseName: string;
        warehouseCode: string;
        productId: string;
        productName: string;
        productSkuCode: string;
        uomId: string;
        uomName: string | null;
        movementType: string;
        referenceType: string;
        quantity: string;
        createdAt: Date;
      }>();

    const countRow = await qb
      .clone()
      .select('COUNT(movement.id)', 'total')
      .offset(undefined)
      .limit(undefined)
      .getRawOne<{ total: string }>();

    return {
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
      meta: { total: Number(countRow?.total ?? 0), page, limit, scope },
    };
  }
}
