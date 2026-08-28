import { IsEnum, IsOptional } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';
export enum ReportProfitViewType {
  CUSTOMER = 'customer',
  PRODUCT = 'product',
}
export class ReportProfitQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsEnum(ReportProfitViewType)
  type?: ReportProfitViewType;
}