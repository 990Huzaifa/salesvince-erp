import { IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportReceivableQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
