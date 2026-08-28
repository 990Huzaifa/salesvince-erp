import { IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportPayableQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
