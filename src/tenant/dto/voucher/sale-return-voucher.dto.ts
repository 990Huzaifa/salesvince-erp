import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ReturnPartyVoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateSaleReturnVoucherItemDto extends ReturnPartyVoucherPaymentFieldsDto {}

export class CreateSaleReturnVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnVoucherItemDto)
  vouchers: CreateSaleReturnVoucherItemDto[];
}

export class UpdateSaleReturnVoucherDto extends PartialType(
  CreateSaleReturnVoucherItemDto,
) {}
