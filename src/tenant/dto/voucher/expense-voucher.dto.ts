import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { VoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateExpenseVoucherItemDto extends VoucherPaymentFieldsDto {
  @IsUUID()
  expenseAccId: string;

  @IsUUID()
  accId: string;
}

export class CreateExpenseVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseVoucherItemDto)
  vouchers: CreateExpenseVoucherItemDto[];
}

export class UpdateExpenseVoucherDto extends PartialType(
  CreateExpenseVoucherItemDto,
) {}
