import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PartyVoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateSaleVoucherItemDto extends PartyVoucherPaymentFieldsDto {}

export class CreateSaleVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleVoucherItemDto)
  vouchers: CreateSaleVoucherItemDto[];
}

export class UpdateSaleVoucherDto extends PartialType(CreateSaleVoucherItemDto) {}
