import { Injectable } from '@nestjs/common';
import { ForecastInsightType } from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';
import { InventoryForecastMetricsService } from './inventory-forecast-metrics.service';
import { ForecastMetricsSnapshot } from './forecast.types';

type Recommendation = {
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  action?: Record<string, unknown>;
  categoryId?: string;
  categoryName?: string;
  productId?: string;
  productName?: string;
};

@Injectable()
export class InventoryForecastRecommendationService {
  constructor(
    private readonly metricsService: InventoryForecastMetricsService,
  ) {}

  build(snapshot: ForecastMetricsSnapshot, max = 10): Recommendation[] {
    const { skus } = snapshot;
    const recommendations: Recommendation[] = [];

    const slowCount = this.metricsService.countByPrimaryInsight(
      skus,
      ForecastInsightType.SLOW_MOVING,
    );
    if (slowCount > 0) {
      const excessQty = skus
        .filter((s) => s.primaryInsight === ForecastInsightType.SLOW_MOVING)
        .reduce(
          (sum, s) => sum + Math.max(0, s.quantityOnHand - s.maxLevel),
          0,
        );
      recommendations.push({
        type: 'REDUCE_SLOW_MOVING',
        severity: 'medium',
        title: 'Reduce slow-moving inventory',
        message: `${slowCount} SKUs have ${snapshot.params.slowMovingDaysCover}+ days cover`,
        action: {
          insightType: ForecastInsightType.SLOW_MOVING,
          estimatedExcessQty: Math.round(excessQty * 1000) / 1000,
        },
      });
    }

    const categoryBelow = new Map<
      string,
      { categoryId: string; categoryName: string; count: number }
    >();
    for (const sku of skus) {
      if (sku.primaryInsight !== ForecastInsightType.BELOW_MINIMUM) {
        continue;
      }
      const key = sku.categoryId || 'uncategorized';
      const existing = categoryBelow.get(key) ?? {
        categoryId: sku.categoryId,
        categoryName: sku.categoryName,
        count: 0,
      };
      existing.count += 1;
      categoryBelow.set(key, existing);
    }

    for (const entry of [...categoryBelow.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)) {
      recommendations.push({
        type: 'INCREASE_CATEGORY',
        severity: 'high',
        title: `Restock ${entry.categoryName}`,
        message: `${entry.count} products below minimum in ${entry.categoryName}`,
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        action: {
          insightType: ForecastInsightType.BELOW_MINIMUM,
          categoryId: entry.categoryId,
        },
      });
    }

    const reorderCandidates = skus
      .filter(
        (s) =>
          s.primaryInsight === ForecastInsightType.BELOW_MINIMUM ||
          s.primaryInsight === ForecastInsightType.STOCKOUT_RISK,
      )
      .sort((a, b) => a.daysOfCover - b.daysOfCover)
      .slice(0, 5);

    for (const sku of reorderCandidates) {
      recommendations.push({
        type: 'REORDER_PRODUCT',
        severity:
          sku.primaryInsight === ForecastInsightType.STOCKOUT_RISK
            ? 'high'
            : 'medium',
        title: `Reorder ${sku.productName}`,
        message: `Suggested reorder: ${sku.suggestedReorderQty} units (${sku.daysOfCover} days cover)`,
        productId: sku.productId,
        productName: sku.productName,
        action: {
          insightType: sku.primaryInsight,
          productId: sku.productId,
          uomId: sku.uomId,
          suggestedReorderQty: sku.suggestedReorderQty,
        },
      });
    }

    const overstockCount = this.metricsService.countByPrimaryInsight(
      skus,
      ForecastInsightType.OVERSTOCK,
    );
    if (overstockCount > 0 && recommendations.length < max) {
      recommendations.push({
        type: 'REDUCE_OVERSTOCK',
        severity: 'low',
        title: 'Review overstock items',
        message: `${overstockCount} SKUs exceed computed maximum level`,
        action: { insightType: ForecastInsightType.OVERSTOCK },
      });
    }

    const highDemandCount = this.metricsService.countByPrimaryInsight(
      skus,
      ForecastInsightType.HIGH_DEMAND,
    );
    if (highDemandCount > 0 && recommendations.length < max) {
      recommendations.push({
        type: 'INCREASE_HIGH_DEMAND',
        severity: 'high',
        title: 'Increase high-demand stock',
        message: `${highDemandCount} products show high demand velocity`,
        action: { insightType: ForecastInsightType.HIGH_DEMAND },
      });
    }

    return recommendations.slice(0, max);
  }
}
