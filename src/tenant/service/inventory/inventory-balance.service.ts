import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { StockBalance } from 'src/tenant-db/entities/stock.entity';
import { GetStockBalanceDto } from 'src/tenant/dto/inventory/get-stock-balance.dto';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import {
  applyWarehouseFilter,
  assertBusinessId,
  createCountQuery,
  resolveInventoryScope,
} from './inventory-query.helper';

@Injectable()
export class InventoryBalanceService {
  private applyCommonFilters(
    qb: SelectQueryBuilder<StockBalance>,
    dto: GetStockBalanceDto,
  ): void {
    if (dto.productId) {
      qb.andWhere('balance.productId = :productId', { productId: dto.productId });
    }
    if (dto.uomId) {
      qb.andWhere('balance.uomId = :uomId', { uomId: dto.uomId });
    }
    if (dto.search?.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${dto.search.trim()}%`,
      });
    }
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: GetStockBalanceDto,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { scope, warehouseId } = resolveInventoryScope(dto);
    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.max(1, Number(dto.limit ?? 10));
    const skip = (page - 1) * limit;

    if (scope === InventoryScope.AUTO) {
      const baseQb = tenantDb
        .getRepository(StockBalance)
        .createQueryBuilder('balance')
        .innerJoin('balance.product', 'product')
        .leftJoin('balance.uom', 'uom')
        .where('balance.businessId = :businessId', { businessId: scopedBusinessId })
        .andWhere('balance.deletedAt IS NULL')
        .andWhere('product.isDelete = false')
        .andWhere('product.isActive = true');

      this.applyCommonFilters(baseQb, dto);

      const totalRow = await createCountQuery(
        baseQb,
        "COUNT(DISTINCT CONCAT(balance.productId, ':', balance.uomId))",
      ).getRawOne<{ total: string }>();

      const rows = await baseQb
        .clone()
        .select('balance.productId', 'productId')
        .addSelect('product.name', 'productName')
        .addSelect('product.skuCode', 'productSkuCode')
        .addSelect('balance.uomId', 'uomId')
        .addSelect('uom.name', 'uomName')
        .addSelect('COALESCE(SUM(balance.quantityAvailable), 0)', 'quantityAvailable')
        .addSelect('COALESCE(SUM(balance.quantityOnHand), 0)', 'quantityOnHand')
        .addSelect('COALESCE(SUM(balance.quantityReserved), 0)', 'quantityReserved')
        .addSelect('COALESCE(SUM(balance.quantityDamaged), 0)', 'quantityDamaged')
        .groupBy('balance.productId')
        .addGroupBy('product.name')
        .addGroupBy('product.skuCode')
        .addGroupBy('balance.uomId')
        .addGroupBy('uom.name')
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
          quantityAvailable: string;
          quantityOnHand: string;
          quantityReserved: string;
          quantityDamaged: string;
        }>();

      return {
        data: rows.map((row) => ({
          productId: row.productId,
          productName: row.productName,
          productSkuCode: row.productSkuCode,
          uomId: row.uomId,
          uomName: row.uomName,
          quantityAvailable: Number(row.quantityAvailable),
          quantityOnHand: Number(row.quantityOnHand),
          quantityReserved: Number(row.quantityReserved),
          quantityDamaged: Number(row.quantityDamaged),
        })),
        meta: {
          total: Number(totalRow?.total ?? 0),
          page,
          limit,
          scope,
        },
      };
    }

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
    this.applyCommonFilters(baseQb, dto);

    const countRow = await createCountQuery(
      baseQb,
      'COUNT(balance.id)',
    ).getRawOne<{ total: string }>();

    const rows = await baseQb
      .clone()
      .select('balance.id', 'id')
      .addSelect('balance.warehouseId', 'warehouseId')
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
      .addSelect('balance.createdAt', 'createdAt')
      .addSelect('balance.updatedAt', 'updatedAt')
      .orderBy('balance.updatedAt', 'DESC')
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
        quantityAvailable: string;
        quantityOnHand: string;
        quantityReserved: string;
        quantityDamaged: string;
        createdAt: Date;
        updatedAt: Date;
      }>();

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
        quantityAvailable: Number(row.quantityAvailable),
        quantityOnHand: Number(row.quantityOnHand),
        quantityReserved: Number(row.quantityReserved),
        quantityDamaged: Number(row.quantityDamaged),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      meta: { total: Number(countRow?.total ?? 0), page, limit, scope },
    };
  }
}
