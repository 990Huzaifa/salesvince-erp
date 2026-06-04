import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportGeneralLedgerQueryDto extends ReportDateRangeQueryDto {
  @IsUUID()
  chartOfAccountId: string;
}

export class ReportTrialBalanceQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsString()
  asOfDate?: string;
}
