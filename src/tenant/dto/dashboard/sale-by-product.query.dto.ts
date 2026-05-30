import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DashboardDateRangeQueryDto } from './dashboard-date-range.query.dto';

export class SaleByProductQueryDto extends DashboardDateRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
