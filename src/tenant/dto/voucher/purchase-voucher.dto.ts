import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PartyVoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreatePurchaseVoucherItemDto extends PartyVoucherPaymentFieldsDto {}

export class CreatePurchaseVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseVoucherItemDto)
  vouchers: CreatePurchaseVoucherItemDto[];
}

export class UpdatePurchaseVoucherDto extends PartialType(
  CreatePurchaseVoucherItemDto,
) {}
