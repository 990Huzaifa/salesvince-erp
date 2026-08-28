import { IsOptional, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportReceivingQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;
}
