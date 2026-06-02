import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { VoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateLoanPaymentVoucherItemDto extends VoucherPaymentFieldsDto {
  @IsUUID()
  loanId: string;

  @IsUUID()
  accId: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  principalAmount: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  interestAmount: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  feeAmount: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  penaltyAmount: number;
}

export class CreateLoanPaymentVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLoanPaymentVoucherItemDto)
  vouchers: CreateLoanPaymentVoucherItemDto[];
}

export class UpdateLoanPaymentVoucherDto extends PartialType(
  CreateLoanPaymentVoucherItemDto,
) {}
