import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import { StockMovement, StockMovementType } from 'src/tenant-db/entities/stock.entity';
import { SaleInvoiceItem } from 'src/tenant-db/entities/sale-invoice.entity';
import { ForecastInsightType } from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';
import { applyWarehouseFilter } from '../inventory-query.helper';
import {
  ForecastMetricsSnapshot,
  SkuForecastMetric,
} from './forecast.types';

@Injectable()
export class InventoryForecastChartService {
  buildCategoryForecast(
    skus: SkuForecastMetric[],
    limit: number,
  ) {
    const byCategory = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        currentStock: number;
        forecastDemand: number;
        belowMinimumCount: number;
        slowMovingCount: number;
        highDemandCount: number;
        optimalCount: number;
        productCount: number;
      }
    >();

    for (const sku of skus) {
      const categoryId = sku.categoryId || 'uncategorized';
      const categoryName = sku.categoryName || 'Uncategorized';
      const existing = byCategory.get(categoryId) ?? {
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

      existing.currentStock += sku.quantityOnHand;
      existing.forecastDemand += sku.forecastQty;
      existing.productCount += 1;
      if (sku.primaryInsight === ForecastInsightType.BELOW_MINIMUM) {
        existing.belowMinimumCount += 1;
      }
      if (sku.primaryInsight === ForecastInsightType.SLOW_MOVING) {
        existing.slowMovingCount += 1;
      }
      if (sku.primaryInsight === ForecastInsightType.HIGH_DEMAND) {
        existing.highDemandCount += 1;
      }
      if (sku.primaryInsight === ForecastInsightType.OPTIMAL) {
        existing.optimalCount += 1;
      }

      byCategory.set(categoryId, existing);
    }

    return [...byCategory.values()]
      .sort((a, b) => b.forecastDemand - a.forecastDemand)
      .slice(0, limit);
  }

  async buildStockSalesForecast(
    tenantDb: DataSource,
    snapshot: ForecastMetricsSnapshot,
    graphFilter: 'daily' | 'weekly',
  ) {
    const { params, skus } = snapshot;
    const avgDailySales =
      skus.reduce((sum, sku) => sum + sku.avgDailySales, 0) || 0;
    const currentStock = skus.reduce((sum, sku) => sum + sku.quantityOnHand, 0);

    const dailySales = await this.loadDailySales(tenantDb, params);
    const dailyNetMovement = await this.loadDailyNetMovement(tenantDb, params);

    const dayMs = 86_400_000;
    const historyDays = Math.max(
      1,
      Math.ceil(
        (params.endDate.getTime() - params.startDate.getTime()) / dayMs,
      ),
    );

    const historyLabels: string[] = [];
    const actualSalesPoints: number[] = [];
    const stockPoints: number[] = [];

    let runningStock = currentStock;
    const stockByDay = new Map<string, number>();
    stockByDay.set(this.dayKey(params.endDate), runningStock);

    for (let offset = 0; offset < historyDays; offset += 1) {
      const day = new Date(params.endDate.getTime() - offset * dayMs);
      const key = this.dayKey(day);
      const net = dailyNetMovement.get(key) ?? 0;
      runningStock = Math.max(0, runningStock - net);
      stockByDay.set(key, runningStock);
    }

    for (let offset = historyDays - 1; offset >= 0; offset -= 1) {
      const day = new Date(params.startDate.getTime() + offset * dayMs);
      const key = this.dayKey(day);
      historyLabels.push(key);
      actualSalesPoints.push(dailySales.get(key) ?? 0);
      stockPoints.push(stockByDay.get(key) ?? currentStock);
    }

    const forecastLabels: string[] = [];
    const forecastSalesPoints: (number | null)[] = [];
    const forecastStockPoints: (number | null)[] = [];

    let projectedStock = currentStock;
    for (let i = 1; i <= params.forecastDays; i += 1) {
      const day = new Date(params.endDate.getTime() + i * dayMs);
      const key = this.dayKey(day);
      forecastLabels.push(key);
      const projectedSales = avgDailySales;
      forecastSalesPoints.push(
        Math.round(projectedSales * 1000) / 1000,
      );
      projectedStock = Math.max(0, projectedStock - projectedSales);
      forecastStockPoints.push(Math.round(projectedStock * 1000) / 1000);
    }

    if (graphFilter === 'weekly') {
      return this.aggregateWeekly(
        historyLabels,
        actualSalesPoints,
        stockPoints,
        forecastLabels,
        forecastSalesPoints,
        forecastStockPoints,
      );
    }

    const labels = [...historyLabels, ...forecastLabels];
    const actualSales = [
      ...actualSalesPoints,
      ...forecastLabels.map(() => null),
    ];
    const forecastSales = [
      ...historyLabels.map(() => null),
      ...forecastSalesPoints,
    ];
    const stockOnHand = [...stockPoints, ...forecastStockPoints];

    return {
      labels,
      series: [
        {
          key: 'actualSales',
          label: 'Sales qty',
          points: actualSales,
        },
        {
          key: 'forecastSales',
          label: 'Forecast qty',
          points: forecastSales,
        },
        {
          key: 'stockOnHand',
          label: 'Stock on hand (estimated)',
          points: stockOnHand,
        },
      ],
    };
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private aggregateWeekly(
    historyLabels: string[],
    actualSales: number[],
    stock: number[],
    forecastLabels: string[],
    forecastSales: (number | null)[],
    forecastStock: (number | null)[],
  ) {
    const bucket = (
      labels: string[],
      values: (number | null)[],
    ): { labels: string[]; values: (number | null)[] } => {
      const outLabels: string[] = [];
      const outValues: (number | null)[] = [];
      for (let i = 0; i < labels.length; i += 7) {
        const slice = values.slice(i, i + 7);
        const sum = slice.reduce<number | null>((acc, val) => {
          if (val === null) {
            return acc;
          }
          return (acc ?? 0) + val;
        }, null);
        outLabels.push(labels[i]);
        outValues.push(sum);
      }
      return { labels: outLabels, values: outValues };
    };

    const hist = bucket(historyLabels, actualSales);
    const histStock = bucket(historyLabels, stock);
    const fore = bucket(forecastLabels, forecastSales);
    const foreStock = bucket(forecastLabels, forecastStock);

    const labels = [...hist.labels, ...fore.labels];
    return {
      labels,
      series: [
        {
          key: 'actualSales',
          label: 'Sales qty',
          points: [...hist.values, ...fore.labels.map(() => null)],
        },
        {
          key: 'forecastSales',
          label: 'Forecast qty',
          points: [...hist.labels.map(() => null), ...fore.values],
        },
        {
          key: 'stockOnHand',
          label: 'Stock on hand (estimated)',
          points: [...histStock.values, ...foreStock.values],
        },
      ],
    };
  }

  private async loadDailySales(
    tenantDb: DataSource,
    params: ForecastMetricsSnapshot['params'],
  ): Promise<Map<string, number>> {
    const qb = tenantDb
      .getRepository(SaleInvoiceItem)
      .createQueryBuilder('item')
      .innerJoin('item.saleInvoice', 'invoice')
      .where('invoice.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .andWhere('item.deletedAt IS NULL')
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

    const rows = await qb
      .select('DATE(invoice.invoiceDate)', 'day')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'total')
      .groupBy('DATE(invoice.invoiceDate)')
      .getRawMany<{ day: string; total: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      const key = this.normalizeDayKey(row.day);
      map.set(key, Number(row.total ?? 0));
    }
    return map;
  }

  private normalizeDayKey(day: unknown): string {
    if (day instanceof Date) {
      return this.dayKey(day);
    }
    return String(day).slice(0, 10);
  }

  private async loadDailyNetMovement(
    tenantDb: DataSource,
    params: ForecastMetricsSnapshot['params'],
  ): Promise<Map<string, number>> {
    const qb = tenantDb
      .getRepository(StockMovement)
      .createQueryBuilder('movement')
      .where('movement.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('movement.deletedAt IS NULL')
      .andWhere('movement.createdAt >= :startDate', {
        startDate: params.startDate,
      })
      .andWhere('movement.createdAt <= :endDate', {
        endDate: params.endDate,
      });

    applyWarehouseFilter(qb, 'movement', params.scope, params.warehouseId);

    const rows = await qb
      .select('DATE(movement.createdAt)', 'day')
      .addSelect(
        `COALESCE(SUM(CASE WHEN movement.movementType = '${StockMovementType.IN}' THEN movement.quantity ELSE -movement.quantity END), 0)`,
        'net',
      )
      .groupBy('DATE(movement.createdAt)')
      .getRawMany<{ day: string; net: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      const key = this.normalizeDayKey(row.day);
      map.set(key, Number(row.net ?? 0));
    }
    return map;
  }
}
