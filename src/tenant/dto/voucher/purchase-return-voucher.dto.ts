import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ReturnPartyVoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreatePurchaseReturnVoucherItemDto extends ReturnPartyVoucherPaymentFieldsDto {}

export class CreatePurchaseReturnVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnVoucherItemDto)
  vouchers: CreatePurchaseReturnVoucherItemDto[];
}

export class UpdatePurchaseReturnVoucherDto extends PartialType(
  CreatePurchaseReturnVoucherItemDto,
) {}
