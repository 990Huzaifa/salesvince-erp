import { InventoryScope } from 'src/tenant/dto/inventory/inventory-scope.dto';
import { ForecastInsightType } from 'src/tenant/dto/inventory/forecast/forecast-insights.query.dto';

export type ForecastResolvedParams = {
  businessId: string;
  scope: InventoryScope;
  warehouseId?: string;
  startDate: Date;
  endDate: Date;
  leadDays: number;
  safetyFactor: number;
  analysisDays: number;
  forecastDays: number;
  slowMovingDaysCover: number;
};

export type SkuForecastMetric = {
  productId: string;
  productName: string;
  skuCode: string;
  uomId: string;
  uomName: string | null;
  categoryId: string;
  categoryName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  warehouseCode: string | null;
  quantityOnHand: number;
  quantityAvailable: number;
  quantityReserved: number;
  totalSoldQty: number;
  avgDailySales: number;
  minLevel: number;
  maxLevel: number;
  daysOfCover: number;
  forecastQty: number;
  gapToMin: number;
  primaryInsight: ForecastInsightType | 'unclassified';
  insightFlags: ForecastInsightType[];
  suggestedReorderQty: number;
};

export type ForecastMetricsSnapshot = {
  params: ForecastResolvedParams;
  skus: SkuForecastMetric[];
  computedAt: string;
};
