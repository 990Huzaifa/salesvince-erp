import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ReportCustomerLowPaymentQueryDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
