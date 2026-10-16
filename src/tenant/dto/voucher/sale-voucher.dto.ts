import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PartyVoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateSaleVoucherItemDto extends PartyVoucherPaymentFieldsDto {
  /** Mark as prebooking advance receipt. Default false = normal sale voucher. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPrebooking?: boolean;
}

export class CreateSaleVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleVoucherItemDto)
  vouchers: CreateSaleVoucherItemDto[];
}

export class UpdateSaleVoucherDto extends PartialType(CreateSaleVoucherItemDto) {}
