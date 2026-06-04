import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export enum ReportRegisterDocumentType {
  SALE_ORDER = 'SALE_ORDER',
  DELIVERY_NOTE = 'DELIVERY_NOTE',
  SALE_INVOICE = 'SALE_INVOICE',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  GRN = 'GRN',
  PURCHASE_INVOICE = 'PURCHASE_INVOICE',
  SALE_VOUCHER = 'SALE_VOUCHER',
  PURCHASE_VOUCHER = 'PURCHASE_VOUCHER',
}

export class ReportRegisterQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
