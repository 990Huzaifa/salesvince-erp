import { IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportProfitByCustomerQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
