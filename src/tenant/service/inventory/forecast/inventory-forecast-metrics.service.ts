import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ForecastBaseQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-base.query.dto';
import {
  ForecastInsightType,
} from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import { StockBalance } from 'src/tenant-db/entities/stock.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { applyWarehouseFilter } from '../inventory-query.helper';
import { resolveForecastParams } from './forecast-params.helper';
import {
  ForecastMetricsSnapshot,
  SkuForecastMetric,
} from './forecast.types';

type StockRow = {
  productId: string;
  uomId: string;
  warehouseId: string | null;
  productName: string;
  skuCode: string;
  categoryId: string;
  categoryName: string;
  uomName: string | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  quantityOnHand: string;
  quantityAvailable: string;
  quantityReserved: string;
};

type SalesRow = {
  productId: string;
  uomId: string;
  warehouseId: string | null;
  totalSoldQty: string;
};

@Injectable()
export class InventoryForecastMetricsService {
  private roundQty(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private skuKey(
    productId: string,
    uomId: string,
    warehouseId: string | null,
    scope: InventoryScope,
  ): string {
    if (scope === InventoryScope.AUTO) {
      return `${productId}:${uomId}`;
    }
    return `${productId}:${uomId}:${warehouseId ?? 'none'}`;
  }

  async buildSnapshot(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: ForecastBaseQueryDto,
  ): Promise<ForecastMetricsSnapshot> {
    const params = resolveForecastParams(businessId, dto);
    const stockRows = await this.loadStockRows(tenantDb, params);
    const salesRows = await this.loadSalesRows(tenantDb, params);

    const salesByKey = new Map<string, number>();
    for (const row of salesRows) {
      const key = this.skuKey(
        row.productId,
        row.uomId,
        row.warehouseId,
        params.scope,
      );
      salesByKey.set(
        key,
        (salesByKey.get(key) ?? 0) + Number(row.totalSoldQty ?? 0),
      );
    }

    const merged = new Map<string, StockRow & { totalSoldQty: number }>();
    for (const row of stockRows) {
      const key = this.skuKey(
        row.productId,
        row.uomId,
        row.warehouseId,
        params.scope,
      );
      merged.set(key, {
        ...row,
        totalSoldQty: salesByKey.get(key) ?? 0,
      });
      salesByKey.delete(key);
    }

    for (const [key, soldQty] of salesByKey.entries()) {
      if (soldQty <= 0) {
        continue;
      }
      const [productId, uomId, warehouseId] =
        params.scope === InventoryScope.AUTO
          ? [key.split(':')[0], key.split(':')[1], null]
          : [
              key.split(':')[0],
              key.split(':')[1],
              key.split(':')[2] === 'none' ? null : key.split(':')[2],
            ];
      merged.set(key, {
        productId,
        uomId,
        warehouseId,
        productName: '',
        skuCode: '',
        categoryId: '',
        categoryName: '',
        uomName: null,
        warehouseName: null,
        warehouseCode: null,
        quantityOnHand: '0',
        quantityAvailable: '0',
        quantityReserved: '0',
        totalSoldQty: soldQty,
      });
    }

    const preliminary = [...merged.values()].map((row) => {
      const quantityOnHand = Number(row.quantityOnHand ?? 0);
      const quantityAvailable = Number(row.quantityAvailable ?? 0);
      const quantityReserved = Number(row.quantityReserved ?? 0);
      const totalSoldQty = row.totalSoldQty;
      const avgDailySales = totalSoldQty / params.analysisDays;
      const minLevel = this.roundQty(avgDailySales * params.leadDays);
      const maxLevel = this.roundQty(minLevel * params.safetyFactor);
      const epsilon = 0.001;
      const daysOfCover =
        avgDailySales > epsilon
          ? this.roundQty(quantityOnHand / avgDailySales)
          : quantityOnHand > 0
            ? 9999
            : 0;

      return {
        productId: row.productId,
        productName: row.productName,
        skuCode: row.skuCode,
        uomId: row.uomId,
        uomName: row.uomName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        warehouseCode: row.warehouseCode,
        quantityOnHand,
        quantityAvailable,
        quantityReserved,
        totalSoldQty,
        avgDailySales: this.roundQty(avgDailySales),
        minLevel,
        maxLevel,
        daysOfCover,
        forecastQty: this.roundQty(avgDailySales * params.forecastDays),
        gapToMin: this.roundQty(quantityOnHand - minLevel),
        suggestedReorderQty: this.roundQty(
          Math.max(0, maxLevel - quantityOnHand),
        ),
      };
    });

    const soldValues = preliminary
      .map((s) => s.totalSoldQty)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const medianSold =
      soldValues.length === 0
        ? 0
        : soldValues[Math.floor(soldValues.length / 2)];

    const salesRates = preliminary
      .map((s) => s.avgDailySales)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const highDemandThreshold =
      salesRates.length === 0
        ? Infinity
        : salesRates[Math.floor(salesRates.length * 0.8)] ?? Infinity;

    const skus: SkuForecastMetric[] = preliminary.map((row) => {
      const flags: ForecastInsightType[] = [];

      const isStockout =
        row.quantityOnHand <= 0 ||
        (row.minLevel > 0 && row.quantityOnHand < row.minLevel * 0.5);
      const isBelowMin =
        row.minLevel > 0 && row.quantityOnHand < row.minLevel;
      const isOverstock = row.maxLevel > 0 && row.quantityOnHand > row.maxLevel;
      const isHighDemand =
        row.avgDailySales > 0 &&
        (row.avgDailySales >= highDemandThreshold ||
          (row.daysOfCover < params.leadDays && row.daysOfCover < 9999));
      const isSlowMoving =
        row.daysOfCover >= params.slowMovingDaysCover &&
        row.totalSoldQty < medianSold;
      const isOptimal =
        row.quantityOnHand >= row.minLevel && row.quantityOnHand <= row.maxLevel;

      if (isStockout) flags.push(ForecastInsightType.STOCKOUT_RISK);
      if (isBelowMin) flags.push(ForecastInsightType.BELOW_MINIMUM);
      if (isOverstock) flags.push(ForecastInsightType.OVERSTOCK);
      if (isHighDemand) flags.push(ForecastInsightType.HIGH_DEMAND);
      if (isSlowMoving) flags.push(ForecastInsightType.SLOW_MOVING);
      if (isOptimal) flags.push(ForecastInsightType.OPTIMAL);

      let primaryInsight: SkuForecastMetric['primaryInsight'] = 'unclassified';
      if (isStockout) {
        primaryInsight = ForecastInsightType.STOCKOUT_RISK;
      } else if (isBelowMin) {
        primaryInsight = ForecastInsightType.BELOW_MINIMUM;
      } else if (isOverstock) {
        primaryInsight = ForecastInsightType.OVERSTOCK;
      } else if (isHighDemand) {
        primaryInsight = ForecastInsightType.HIGH_DEMAND;
      } else if (isSlowMoving) {
        primaryInsight = ForecastInsightType.SLOW_MOVING;
      } else if (isOptimal) {
        primaryInsight = ForecastInsightType.OPTIMAL;
      }

      return {
        ...row,
        primaryInsight,
        insightFlags: flags,
      };
    });

    return {
      params,
      skus,
      computedAt: new Date().toISOString(),
    };
  }

  private async loadStockRows(
    tenantDb: DataSource,
    params: ForecastMetricsSnapshot['params'],
  ): Promise<StockRow[]> {
    const qb = tenantDb
      .getRepository(StockBalance)
      .createQueryBuilder('balance')
      .innerJoin('balance.product', 'product')
      .innerJoin('product.category', 'category')
      .innerJoin('balance.warehouse', 'warehouse')
      .leftJoin('balance.uom', 'uom')
      .where('balance.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('balance.deletedAt IS NULL')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('warehouse.deletedAt IS NULL');

    applyWarehouseFilter(qb, 'balance', params.scope, params.warehouseId);

    if (params.scope === InventoryScope.AUTO) {
      return qb
        .select('balance.productId', 'productId')
        .addSelect('balance.uomId', 'uomId')
        .addSelect('NULL', 'warehouseId')
        .addSelect('product.name', 'productName')
        .addSelect('product.skuCode', 'skuCode')
        .addSelect('product.categoryId', 'categoryId')
        .addSelect('category.name', 'categoryName')
        .addSelect('uom.name', 'uomName')
        .addSelect('NULL', 'warehouseName')
        .addSelect('NULL', 'warehouseCode')
        .addSelect('COALESCE(SUM(balance.quantityOnHand), 0)', 'quantityOnHand')
        .addSelect(
          'COALESCE(SUM(balance.quantityAvailable), 0)',
          'quantityAvailable',
        )
        .addSelect(
          'COALESCE(SUM(balance.quantityReserved), 0)',
          'quantityReserved',
        )
        .groupBy('balance.productId')
        .addGroupBy('balance.uomId')
        .addGroupBy('product.name')
        .addGroupBy('product.skuCode')
        .addGroupBy('product.categoryId')
        .addGroupBy('category.name')
        .addGroupBy('uom.name')
        .getRawMany<StockRow>();
    }

    return qb
      .select('balance.productId', 'productId')
      .addSelect('balance.uomId', 'uomId')
      .addSelect('balance.warehouseId', 'warehouseId')
      .addSelect('product.name', 'productName')
      .addSelect('product.skuCode', 'skuCode')
      .addSelect('product.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('uom.name', 'uomName')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('warehouse.code', 'warehouseCode')
      .addSelect('balance.quantityOnHand', 'quantityOnHand')
      .addSelect('balance.quantityAvailable', 'quantityAvailable')
      .addSelect('balance.quantityReserved', 'quantityReserved')
      .getRawMany<StockRow>();
  }

  private async loadSalesRows(
    tenantDb: DataSource,
    params: ForecastMetricsSnapshot['params'],
  ): Promise<SalesRow[]> {
    const qb = tenantDb
      .getRepository(SaleInvoiceItem)
      .createQueryBuilder('item')
      .innerJoin('item.saleInvoice', 'invoice')
      .innerJoin('item.product', 'product')
      .where('invoice.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('item.deletedAt IS NULL')
      .andWhere('product.isDelete = false')
      .andWhere('product.isActive = true')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: params.startDate,
      })
      .andWhere('invoice.invoiceDate <= :endDate', {
        endDate: params.endDate,
      });

    if (params.scope === InventoryScope.WAREHOUSE && params.warehouseId) {
      qb.andWhere('item.warehouseId = :warehouseId', {
        warehouseId: params.warehouseId,
      });
    }

    if (params.scope === InventoryScope.AUTO) {
      return qb
        .select('item.productId', 'productId')
        .addSelect('item.uomId', 'uomId')
        .addSelect('NULL', 'warehouseId')
        .addSelect('COALESCE(SUM(item.quantity), 0)', 'totalSoldQty')
        .groupBy('item.productId')
        .addGroupBy('item.uomId')
        .getRawMany<SalesRow>();
    }

    return qb
      .select('item.productId', 'productId')
      .addSelect('item.uomId', 'uomId')
      .addSelect('item.warehouseId', 'warehouseId')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'totalSoldQty')
      .groupBy('item.productId')
      .addGroupBy('item.uomId')
      .addGroupBy('item.warehouseId')
      .getRawMany<SalesRow>();
  }

  filterByInsight(
    skus: SkuForecastMetric[],
    insightType: ForecastInsightType,
  ): SkuForecastMetric[] {
    return skus.filter(
      (sku) =>
        sku.primaryInsight === insightType ||
        sku.insightFlags.includes(insightType),
    );
  }

  countByPrimaryInsight(
    skus: SkuForecastMetric[],
    insightType: ForecastInsightType,
  ): number {
    return skus.filter((sku) => sku.primaryInsight === insightType).length;
  }

  mapSkuToListRow(sku: SkuForecastMetric, insightType?: ForecastInsightType) {
    return {
      productId: sku.productId,
      productName: sku.productName,
      skuCode: sku.skuCode,
      uomId: sku.uomId,
      uomName: sku.uomName,
      warehouseId: sku.warehouseId,
      warehouseName: sku.warehouseName,
      warehouseCode: sku.warehouseCode,
      quantityOnHand: sku.quantityOnHand,
      quantityAvailable: sku.quantityAvailable,
      quantityReserved: sku.quantityReserved,
      avgDailySales: sku.avgDailySales,
      minLevel: sku.minLevel,
      maxLevel: sku.maxLevel,
      daysOfCover: sku.daysOfCover,
      forecastQty: sku.forecastQty,
      gapToMin: sku.gapToMin,
      insightType: insightType ?? sku.primaryInsight,
      insightFlags: sku.insightFlags,
      suggestedReorderQty: sku.suggestedReorderQty,
    };
  }
}
