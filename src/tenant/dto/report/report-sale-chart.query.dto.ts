import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export enum ReportSaleChartFilterType {
  CITY = 'CITY',
  CUSTOMER = 'CUSTOMER',
  MONTH = 'MONTH',
  PRODUCT = 'PRODUCT',
}

export class ReportSaleChartQueryDto extends ReportDateRangeQueryDto {
  @IsEnum(ReportSaleChartFilterType)
  filterType: ReportSaleChartFilterType;

  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}
