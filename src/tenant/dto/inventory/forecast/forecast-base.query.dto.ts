import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InventoryScopeDto } from '../inventory-scope.dto';

export class ForecastBaseQueryDto extends InventoryScopeDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  leadDays: number = 7;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(10)
  safetyFactor: number = 2;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  analysisDays: number = 90;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(180)
  forecastDays: number = 30;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(365)
  slowMovingDaysCover: number = 90;
}
