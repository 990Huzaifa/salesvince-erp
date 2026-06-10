import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Batch } from 'src/tenant-db/entities/stock.entity';
import { GetBatchDetailDto } from 'src/tenant/dto/inventory/get-batch-detail.dto';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import {
  applyWarehouseFilter,
  assertBusinessId,
  assertDateRange,
  createCountQuery,
  resolveInventoryScope,
} from './inventory-query.helper';

@Injectable()
export class InventoryBatchService {
  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: GetBatchDetailDto,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const { scope, warehouseId } = resolveInventoryScope(dto);
    assertDateRange(dto.fromDate, dto.toDate);

    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.max(1, Number(dto.limit ?? 10));
    const skip = (page - 1) * limit;

    if (scope === InventoryScope.AUTO) {
      const qb = tenantDb
        .getRepository(Batch)
        .createQueryBuilder('batch')
        .innerJoin('batch.product', 'product')
        .leftJoin('batch.uom', 'uom')
        .where('batch.businessId = :businessId', { businessId: scopedBusinessId })
        .andWhere('batch.deletedAt IS NULL')
        .andWhere('batch.quantity > 0')
        .andWhere('product.isDelete = false')
        .andWhere('product.isActive = true');

      if (dto.productId) {
        qb.andWhere('batch.productId = :productId', { productId: dto.productId });
      }
      if (dto.uomId) {
        qb.andWhere('batch.uomId = :uomId', { uomId: dto.uomId });
      }
      if (dto.search?.trim()) {
        qb.andWhere(
          '(product.name ILIKE :search OR batch.batchNumber ILIKE :search)',
          { search: `%${dto.search.trim()}%` },
        );
      }
      if (dto.fromDate) {
        qb.andWhere('batch.batchDate >= :fromDate', { fromDate: dto.fromDate });
      }
      if (dto.toDate) {
        qb.andWhere('batch.batchDate <= :toDate', { toDate: dto.toDate });
      }

      const countRow = await createCountQuery(
        qb,
        "COUNT(DISTINCT CONCAT(batch.productId, ':', batch.uomId))",
      ).getRawOne<{ total: string }>();

      const rows = await qb
        .clone()
        .select('batch.productId', 'productId')
        .addSelect('product.name', 'productName')
        .addSelect('product.skuCode', 'productSkuCode')
        .addSelect('batch.uomId', 'uomId')
        .addSelect('uom.name', 'uomName')
        .addSelect('COUNT(batch.id)', 'batchCount')
        .addSelect('COALESCE(SUM(batch.quantity), 0)', 'quantity')
        .addSelect('COALESCE(AVG(batch.purchaseUnitPrice), 0)', 'avgPurchaseUnitPrice')
        .addSelect(
          'COALESCE(AVG(batch.saleUnitPrice), 0)',
          'avgSaleUnitPrice',
        )
        .groupBy('batch.productId')
        .addGroupBy('product.name')
        .addGroupBy('product.skuCode')
        .addGroupBy('batch.uomId')
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
          batchCount: string;
          quantity: string;
          avgPurchaseUnitPrice: string;
          avgSaleUnitPrice: string;
        }>();

      return {
        data: rows.map((row) => ({
          productId: row.productId,
          productName: row.productName,
          productSkuCode: row.productSkuCode,
          uomId: row.uomId,
          uomName: row.uomName,
          batchCount: Number(row.batchCount),
          quantity: Number(row.quantity),
          avgPurchaseUnitPrice: Number(row.avgPurchaseUnitPrice),
          avgSaleUnitPrice: Number(row.avgSaleUnitPrice),
        })),
        meta: { total: Number(countRow?.total ?? 0), page, limit, scope },
      };
    }

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

    if (dto.productId) {
      qb.andWhere('batch.productId = :productId', { productId: dto.productId });
    }
    if (dto.uomId) {
      qb.andWhere('batch.uomId = :uomId', { uomId: dto.uomId });
    }
    if (dto.search?.trim()) {
      qb.andWhere(
        '(product.name ILIKE :search OR batch.batchNumber ILIKE :search)',
        { search: `%${dto.search.trim()}%` },
      );
    }
    if (dto.fromDate) {
      qb.andWhere('batch.batchDate >= :fromDate', { fromDate: dto.fromDate });
    }
    if (dto.toDate) {
      qb.andWhere('batch.batchDate <= :toDate', { toDate: dto.toDate });
    }

    const countRow = await createCountQuery(qb, 'COUNT(batch.id)').getRawOne<{
      total: string;
    }>();

    const rows = await qb
      .clone()
      .select('batch.id', 'id')
      .addSelect('batch.batchNumber', 'batchNumber')
      .addSelect('batch.batchDate', 'batchDate')
      .addSelect('batch.expiryDate', 'expiryDate')
      .addSelect('batch.quantity', 'quantity')
      .addSelect('batch.purchaseUnitPrice', 'purchaseUnitPrice')
      .addSelect('batch.saleUnitPrice', 'saleUnitPrice')
      .addSelect('batch.warehouseId', 'warehouseId')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('warehouse.code', 'warehouseCode')
      .addSelect('batch.productId', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'productSkuCode')
      .addSelect('batch.uomId', 'uomId')
      .addSelect('uom.name', 'uomName')
      .addSelect('batch.createdAt', 'createdAt')
      .addSelect('batch.updatedAt', 'updatedAt')
      .orderBy('batch.batchDate', 'DESC')
      .addOrderBy('batch.createdAt', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany<{
        id: string;
        batchNumber: string;
        batchDate: Date;
        expiryDate: Date | null;
        quantity: string;
        purchaseUnitPrice: string;
        saleUnitPrice: string;
        warehouseId: string;
        warehouseName: string;
        warehouseCode: string;
        productId: string;
        productName: string;
        productSkuCode: string;
        uomId: string;
        uomName: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>();

    return {
      data: rows.map((row) => ({
        id: row.id,
        batchNumber: row.batchNumber,
        batchDate: row.batchDate,
        expiryDate: row.expiryDate,
        quantity: Number(row.quantity),
        purchaseUnitPrice: Number(row.purchaseUnitPrice),
        saleUnitPrice: Number(row.saleUnitPrice),
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        warehouseCode: row.warehouseCode,
        productId: row.productId,
        productName: row.productName,
        productSkuCode: row.productSkuCode,
        uomId: row.uomId,
        uomName: row.uomName,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      meta: { total: Number(countRow?.total ?? 0), page, limit, scope },
    };
  }
}
