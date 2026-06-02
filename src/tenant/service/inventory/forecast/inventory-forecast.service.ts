import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ForecastCategoriesQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-categories.query.dto';
import { ForecastInsightType } from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';
import { ForecastInsightsQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';
import { ForecastOverviewQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-overview.query.dto';
import { ForecastProductDetailQueryDto } from 'src/tenant/dto/inventory/forecast/forecast-product-detail.query.dto';
import { InventoryForecastChartService } from './inventory-forecast-chart.service';
import { InventoryForecastInsightsService } from './inventory-forecast-insights.service';
import { InventoryForecastMetricsService } from './inventory-forecast-metrics.service';
import { InventoryForecastRecommendationService } from './inventory-forecast-recommendation.service';

@Injectable()
export class InventoryForecastService {
  constructor(
    private readonly metricsService: InventoryForecastMetricsService,
    private readonly chartService: InventoryForecastChartService,
    private readonly recommendationService: InventoryForecastRecommendationService,
    private readonly insightsService: InventoryForecastInsightsService,
  ) {}

  async getOverview(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: ForecastOverviewQueryDto,
  ) {
    const snapshot = await this.metricsService.buildSnapshot(
      tenantDb,
      businessId,
      dto,
    );

    const cards = [
      {
        key: ForecastInsightType.HIGH_DEMAND,
        label: 'High demand products',
        value: this.metricsService.countByPrimaryInsight(
          snapshot.skus,
          ForecastInsightType.HIGH_DEMAND,
        ),
      },
      {
        key: ForecastInsightType.SLOW_MOVING,
        label: 'Slow moving products',
        value: this.metricsService.countByPrimaryInsight(
          snapshot.skus,
          ForecastInsightType.SLOW_MOVING,
        ),
      },
      {
        key: ForecastInsightType.BELOW_MINIMUM,
        label: 'Below minimum level',
        value: this.metricsService.countByPrimaryInsight(
          snapshot.skus,
          ForecastInsightType.BELOW_MINIMUM,
        ),
      },
      {
        key: ForecastInsightType.OPTIMAL,
        label: 'Optimal stock (safe range)',
        value: this.metricsService.countByPrimaryInsight(
          snapshot.skus,
          ForecastInsightType.OPTIMAL,
        ),
      },
      {
        key: ForecastInsightType.OVERSTOCK,
        label: 'Overstock',
        value: this.metricsService.countByPrimaryInsight(
          snapshot.skus,
          ForecastInsightType.OVERSTOCK,
        ),
      },
      {
        key: ForecastInsightType.STOCKOUT_RISK,
        label: 'Stockout risk',
        value: this.metricsService.countByPrimaryInsight(
          snapshot.skus,
          ForecastInsightType.STOCKOUT_RISK,
        ),
      },
      {
        key: 'total_active_skus',
        label: 'Active SKUs tracked',
        value: snapshot.skus.length,
      },
    ];

    const [stockSalesForecast, categoryForecast] = await Promise.all([
      this.chartService.buildStockSalesForecast(
        tenantDb,
        snapshot,
        dto.graphFilter ?? 'daily',
      ),
      Promise.resolve(
        this.chartService.buildCategoryForecast(
          snapshot.skus,
          dto.categoryLimit ?? 8,
        ),
      ),
    ]);

    const recommendations = this.recommendationService.build(snapshot, 10);

    return {
      data: {
        cards,
        charts: {
          stockSalesForecast,
          categoryForecast,
        },
        recommendations,
        meta: {
          scope: snapshot.params.scope,
          startDate: snapshot.params.startDate.toISOString(),
          endDate: snapshot.params.endDate.toISOString(),
          leadDays: snapshot.params.leadDays,
          safetyFactor: snapshot.params.safetyFactor,
          analysisDays: snapshot.params.analysisDays,
          forecastDays: snapshot.params.forecastDays,
          slowMovingDaysCover: snapshot.params.slowMovingDaysCover,
          forecastSource: 'stats' as const,
          forecastVersion: '1',
          computedAt: snapshot.computedAt,
        },
      },
    };
  }

  async listInsightProducts(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: ForecastInsightsQueryDto,
  ) {
    const snapshot = await this.metricsService.buildSnapshot(
      tenantDb,
      businessId,
      dto,
    );
    return this.insightsService.listInsightProducts(snapshot, dto);
  }

  async listCategories(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: ForecastCategoriesQueryDto,
  ) {
    const snapshot = await this.metricsService.buildSnapshot(
      tenantDb,
      businessId,
      dto,
    );
    return this.insightsService.listCategories(snapshot, dto);
  }

  async listCategoryProducts(
    tenantDb: DataSource,
    businessId: string | undefined,
    categoryId: string,
    dto: ForecastCategoriesQueryDto,
  ) {
    const snapshot = await this.metricsService.buildSnapshot(
      tenantDb,
      businessId,
      dto,
    );
    return this.insightsService.listCategoryProducts(
      snapshot,
      categoryId,
      dto,
    );
  }

  async getProductDetail(
    tenantDb: DataSource,
    businessId: string | undefined,
    productId: string,
    dto: ForecastProductDetailQueryDto,
  ) {
    const snapshot = await this.metricsService.buildSnapshot(
      tenantDb,
      businessId,
      dto,
    );
    return this.insightsService.getProductDetail(
      tenantDb,
      snapshot,
      productId,
      dto,
    );
  }
}
