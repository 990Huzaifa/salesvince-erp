import { IsOptional, IsString } from 'class-validator';
import { ReportPaginationQueryDto } from './report-pagination.query.dto';

export class ReportDateRangeQueryDto extends ReportPaginationQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
