import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ReportPaginationQueryDto } from './report-pagination.query.dto';

export class ReportCustomerLowPaymentQueryDto extends ReportPaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minLastPaymentDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxLastPaymentDays?: number;
}
