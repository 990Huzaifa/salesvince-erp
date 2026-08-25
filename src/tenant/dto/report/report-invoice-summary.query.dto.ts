import { IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportInvoiceSummaryQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}
