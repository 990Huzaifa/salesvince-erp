import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ForecastCategoriesQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-categories.query.dto';
import {
  ForecastInsightType,
  ForecastInsightsQueryDto,
} from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';
import { ForecastProductDetailQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-product-detail.query.dto';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import { Product } from 'src/tenant-db/entities/product.entity';
import { Batch, StockMovement } from 'src/tenant-db/entities/stock.entity';
import { SaleInvoiceItem } from 'src/tenant-db/entities/sale-invoice.entity';
import { applyWarehouseFilter } from '../inventory-query.helper';
import { InventoryForecastMetricsService } from './inventory-forecast-metrics.service';
import { ForecastMetricsSnapshot, SkuForecastMetric } from './forecast.types';

@Injectable()
export class InventoryForecastInsightsService {
  constructor(
    private readonly metricsService: InventoryForecastMetricsService,
  ) {}

  listInsightProducts(snapshot: ForecastMetricsSnapshot, dto: ForecastInsightsQueryDto) {
    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.max(1, Number(dto.limit ?? 10));
    const filtered = this.metricsService.filterByInsight(
      snapshot.skus,
      dto.insightType,
    );
    const sorted = this.sortSkus(filtered, dto.sortBy, dto.sortOrder);
    const total = sorted.length;
    const skip = (page - 1) * limit;
    const pageRows = sorted.slice(skip, skip + limit);

    return {
      data: pageRows.map((sku) =>
        this.metricsService.mapSkuToListRow(sku, dto.insightType),
      ),
      meta: {
        total,
        page,
        limit,
        scope: snapshot.params.scope,
        insightType: dto.insightType,
      },
    };
  }

  listCategories(snapshot: ForecastMetricsSnapshot, dto: ForecastCategoriesQueryDto) {
    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.max(1, Number(dto.limit ?? 20));
    const rows = this.aggregateCategories(snapshot.skus);
    const total = rows.length;
    const skip = (page - 1) * limit;

    return {
      data: rows.slice(skip, skip + limit),
      meta: { total, page, limit, scope: snapshot.params.scope },
    };
  }

  listCategoryProducts(
    snapshot: ForecastMetricsSnapshot,
    categoryId: string,
    dto: ForecastCategoriesQueryDto,
  ) {
    const page = Math.max(1, Number(dto.page ?? 1));
    const limit = Math.max(1, Number(dto.limit ?? 20));
    const filtered = snapshot.skus.filter(
      (sku) => (sku.categoryId || 'uncategorized') === categoryId,
    );
    const total = filtered.length;
    const skip = (page - 1) * limit;

    return {
      data: filtered.slice(skip, skip + limit).map((sku) => ({
        ...this.metricsService.mapSkuToListRow(sku),
        insightFlags: sku.insightFlags,
      })),
      meta: { total, page, limit, scope: snapshot.params.scope, categoryId },
    };
  }

  async getProductDetail(
    tenantDb: DataSource,
    snapshot: ForecastMetricsSnapshot,
    productId: string,
    dto: ForecastProductDetailQueryDto,
  ) {
    const matches = snapshot.skus.filter((sku) => {
      if (sku.productId !== productId) {
        return false;
      }
      if (dto.uomId && sku.uomId !== dto.uomId) {
        return false;
      }
      return true;
    });

    const product = await tenantDb.getRepository(Product).findOne({
      where: {
        id: productId,
        businessId: snapshot.params.businessId,
        isDelete: false,
      },
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const primarySku = matches[0];
    const salesChart = await this.buildProductSalesChart(
      tenantDb,
      snapshot,
      productId,
      dto.uomId,
    );
    const movements = await this.loadRecentMovements(
      tenantDb,
      snapshot,
      productId,
      dto.uomId,
    );
    const batchSummary = await this.loadBatchSummary(
      tenantDb,
      snapshot,
      productId,
      dto.uomId,
    );

    return {
      data: {
        product: {
          id: product.id,
          name: product.name,
          skuCode: product.skuCode,
          categoryId: product.categoryId,
          categoryName: product.category?.name ?? null,
          batchPickStrategy: product.batchPickStrategy,
        },
        balances: matches.map((sku) => ({
          uomId: sku.uomId,
          uomName: sku.uomName,
          warehouseId: sku.warehouseId,
          warehouseName: sku.warehouseName,
          quantityOnHand: sku.quantityOnHand,
          quantityAvailable: sku.quantityAvailable,
          quantityReserved: sku.quantityReserved,
        })),
        metrics: primarySku
          ? {
              avgDailySales: primarySku.avgDailySales,
              minLevel: primarySku.minLevel,
              maxLevel: primarySku.maxLevel,
              daysOfCover: primarySku.daysOfCover,
              forecastQty: primarySku.forecastQty,
              gapToMin: primarySku.gapToMin,
              suggestedReorderQty: primarySku.suggestedReorderQty,
              primaryInsight: primarySku.primaryInsight,
              insightFlags: primarySku.insightFlags,
            }
          : null,
        skuBreakdown: matches.map((sku) =>
          this.metricsService.mapSkuToListRow(sku),
        ),
        salesChart,
        recentMovements: movements,
        batchSummary,
        recommendation: primarySku
          ? this.buildSkuRecommendation(primarySku)
          : null,
      },
    };
  }

  private sortSkus(
    skus: SkuForecastMetric[],
    sortBy: ForecastInsightsQueryDto['sortBy'],
    sortOrder: ForecastInsightsQueryDto['sortOrder'],
  ) {
    const dir = sortOrder === 'DESC' ? -1 : 1;
    return [...skus].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av < bv) {
        return -1 * dir;
      }
      if (av > bv) {
        return 1 * dir;
      }
      return 0;
    });
  }

  private aggregateCategories(skus: SkuForecastMetric[]) {
    const map = new Map<string, ReturnType<typeof this.emptyCategory>>();
    for (const sku of skus) {
      const categoryId = sku.categoryId || 'uncategorized';
      const row =
        map.get(categoryId) ??
        this.emptyCategory(categoryId, sku.categoryName || 'Uncategorized');
      row.currentStock += sku.quantityOnHand;
      row.forecastDemand += sku.forecastQty;
      row.productCount += 1;
      if (sku.primaryInsight === ForecastInsightType.BELOW_MINIMUM) {
        row.belowMinimumCount += 1;
      }
      if (sku.primaryInsight === ForecastInsightType.SLOW_MOVING) {
        row.slowMovingCount += 1;
      }
      if (sku.primaryInsight === ForecastInsightType.HIGH_DEMAND) {
        row.highDemandCount += 1;
      }
      if (sku.primaryInsight === ForecastInsightType.OPTIMAL) {
        row.optimalCount += 1;
      }
      map.set(categoryId, row);
    }
    return [...map.values()].sort((a, b) => b.forecastDemand - a.forecastDemand);
  }

  private emptyCategory(categoryId: string, categoryName: string) {
    return {
      categoryId,
      categoryName,
      currentStock: 0,
      forecastDemand: 0,
      belowMinimumCount: 0,
      slowMovingCount: 0,
      highDemandCount: 0,
      optimalCount: 0,
      productCount: 0,
    };
  }

  private buildSkuRecommendation(sku: SkuForecastMetric) {
    if (
      sku.primaryInsight === ForecastInsightType.BELOW_MINIMUM ||
      sku.primaryInsight === ForecastInsightType.STOCKOUT_RISK
    ) {
      return {
        type: 'REORDER_PRODUCT',
        message: `Reorder ${sku.suggestedReorderQty} units to reach safe range`,
      };
    }
    if (sku.primaryInsight === ForecastInsightType.SLOW_MOVING) {
      return {
        type: 'REDUCE_SLOW_MOVING',
        message: 'Consider promotions or reducing purchase volume',
      };
    }
    if (sku.primaryInsight === ForecastInsightType.OVERSTOCK) {
      return {
        type: 'REDUCE_OVERSTOCK',
        message: 'Stock exceeds computed maximum; avoid further purchases',
      };
    }
    return null;
  }

  private async buildProductSalesChart(
    tenantDb: DataSource,
    snapshot: ForecastMetricsSnapshot,
    productId: string,
    uomId?: string,
  ) {
    const qb = tenantDb
      .getRepository(SaleInvoiceItem)
      .createQueryBuilder('item')
      .innerJoin('item.saleInvoice', 'invoice')
      .where('invoice.businessId = :businessId', {
        businessId: snapshot.params.businessId,
      })
      .andWhere('item.productId = :productId', { productId })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('item.deletedAt IS NULL')
      .andWhere('invoice.invoiceDate >= :startDate', {
        startDate: snapshot.params.startDate,
      })
      .andWhere('invoice.invoiceDate <= :endDate', {
        endDate: snapshot.params.endDate,
      });

    if (uomId) {
      qb.andWhere('item.uomId = :uomId', { uomId });
    }
    if (
      snapshot.params.scope === InventoryScope.WAREHOUSE &&
      snapshot.params.warehouseId
    ) {
      qb.andWhere('item.warehouseId = :warehouseId', {
        warehouseId: snapshot.params.warehouseId,
      });
    }

    const rows = await qb
      .select("DATE_TRUNC('week', invoice.invoiceDate)", 'week')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'total')
      .groupBy("DATE_TRUNC('week', invoice.invoiceDate)")
      .orderBy("DATE_TRUNC('week', invoice.invoiceDate)", 'ASC')
      .getRawMany<{ week: string; total: string }>();

    const avgWeekly =
      rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0) /
      Math.max(rows.length, 1);
    const forecastWeeks = Math.ceil(snapshot.params.forecastDays / 7);

    return {
      history: rows.map((row) => ({
        week: String(row.week).slice(0, 10),
        quantity: Number(row.total ?? 0),
      })),
      forecast: Array.from({ length: forecastWeeks }, (_, index) => ({
        week: `forecast+${index + 1}`,
        quantity: Math.round(avgWeekly * 1000) / 1000,
      })),
    };
  }

  private async loadRecentMovements(
    tenantDb: DataSource,
    snapshot: ForecastMetricsSnapshot,
    productId: string,
    uomId?: string,
  ) {
    const qb = tenantDb
      .getRepository(StockMovement)
      .createQueryBuilder('movement')
      .innerJoin('movement.warehouse', 'warehouse')
      .leftJoin('movement.uom', 'uom')
      .where('movement.businessId = :businessId', {
        businessId: snapshot.params.businessId,
      })
      .andWhere('movement.productId = :productId', { productId })
      .andWhere('movement.deletedAt IS NULL')
      .andWhere('warehouse.deletedAt IS NULL');

    applyWarehouseFilter(
      qb,
      'movement',
      snapshot.params.scope,
      snapshot.params.warehouseId,
    );

    if (uomId) {
      qb.andWhere('movement.uomId = :uomId', { uomId });
    }

    const rows = await qb
      .select('movement.id', 'id')
      .addSelect('movement.movementType', 'movementType')
      .addSelect('movement.referenceType', 'referenceType')
      .addSelect('movement.quantity', 'quantity')
      .addSelect('movement.createdAt', 'createdAt')
      .addSelect('warehouse.name', 'warehouseName')
      .addSelect('uom.name', 'uomName')
      .orderBy('movement.createdAt', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map((row) => ({
      id: row.id,
      movementType: row.movementType,
      referenceType: row.referenceType,
      quantity: Number(row.quantity),
      createdAt: row.createdAt,
      warehouseName: row.warehouseName,
      uomName: row.uomName,
    }));
  }

  private async loadBatchSummary(
    tenantDb: DataSource,
    snapshot: ForecastMetricsSnapshot,
    productId: string,
    uomId?: string,
  ) {
    const qb = tenantDb
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .where('batch.businessId = :businessId', {
        businessId: snapshot.params.businessId,
      })
      .andWhere('batch.productId = :productId', { productId })
      .andWhere('batch.deletedAt IS NULL')
      .andWhere('batch.quantity > 0');

    applyWarehouseFilter(
      qb,
      'batch',
      snapshot.params.scope,
      snapshot.params.warehouseId,
    );

    if (uomId) {
      qb.andWhere('batch.uomId = :uomId', { uomId });
    }

    const nearest = await qb
      .clone()
      .select('batch.expiryDate', 'expiryDate')
      .orderBy('batch.expiryDate', 'ASC', 'NULLS LAST')
      .limit(1)
      .getRawOne<{ expiryDate: Date | null }>();

    const countRow = await qb
      .select('COUNT(batch.id)', 'count')
      .addSelect('COALESCE(SUM(batch.quantity), 0)', 'quantity')
      .getRawOne<{ count: string; quantity: string }>();

    return {
      activeBatchCount: Number(countRow?.count ?? 0),
      totalBatchQuantity: Number(countRow?.quantity ?? 0),
      nearestExpiry: nearest?.expiryDate ?? null,
    };
  }
}
