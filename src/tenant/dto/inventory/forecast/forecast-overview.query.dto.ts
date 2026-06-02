import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ForecastBaseQueryDto } from './forecast-base.query.dto';

export class ForecastOverviewQueryDto extends ForecastBaseQueryDto {
  @IsOptional()
  @IsEnum(['daily', 'weekly'])
  graphFilter: 'daily' | 'weekly' = 'daily';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  categoryLimit: number = 8;
}
