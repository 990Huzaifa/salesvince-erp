import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export enum PrebookingPaymentStatusFilter {
  ALL = 'ALL',
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

export class ReportPrebookingQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsEnum(PrebookingPaymentStatusFilter)
  paymentStatus?: PrebookingPaymentStatusFilter = PrebookingPaymentStatusFilter.ALL;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
