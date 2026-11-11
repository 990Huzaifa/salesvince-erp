import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ReportPaginationQueryDto } from './report-pagination.query.dto';

export class ReportCustomerBalanceQueryDto extends ReportPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cityId?: number;
}
