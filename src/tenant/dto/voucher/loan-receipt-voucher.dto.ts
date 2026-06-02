import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { VoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateLoanReceiptVoucherItemDto extends VoucherPaymentFieldsDto {
  @IsUUID()
  loanId: string;

  @IsUUID()
  accId: string;
}

export class CreateLoanReceiptVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLoanReceiptVoucherItemDto)
  vouchers: CreateLoanReceiptVoucherItemDto[];
}

export class UpdateLoanReceiptVoucherDto extends PartialType(
  CreateLoanReceiptVoucherItemDto,
) {}
