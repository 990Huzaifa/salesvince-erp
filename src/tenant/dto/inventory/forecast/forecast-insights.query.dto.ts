import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ForecastBaseQueryDto } from './forecast-base.query.dto';

export enum ForecastInsightType {
  HIGH_DEMAND = 'high_demand',
  SLOW_MOVING = 'slow_moving',
  BELOW_MINIMUM = 'below_minimum',
  OPTIMAL = 'optimal',
  OVERSTOCK = 'overstock',
  STOCKOUT_RISK = 'stockout_risk',
}

export class ForecastInsightsQueryDto extends ForecastBaseQueryDto {
  @IsEnum(ForecastInsightType)
  insightType: ForecastInsightType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsIn(['daysOfCover', 'avgDailySales', 'gapToMin', 'quantityOnHand'])
  sortBy: 'daysOfCover' | 'avgDailySales' | 'gapToMin' | 'quantityOnHand' =
    'gapToMin';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'ASC';
}
