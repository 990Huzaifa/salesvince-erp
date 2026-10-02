import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportProfitAndLossQueryDto extends ReportDateRangeQueryDto {}

export class ReportFinancialReportQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class ReportBalanceSheetQueryDto {
  @IsOptional()
  @IsString()
  asOfDate?: string;

  /** Used to compute current-period profit line in equity section. */
  @IsOptional()
  @IsString()
  profitPeriodStartDate?: string;
}

export class ReportTaxSummaryQueryDto extends ReportDateRangeQueryDto {}
