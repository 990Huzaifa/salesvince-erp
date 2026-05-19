import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { VoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateContraVoucherItemDto extends VoucherPaymentFieldsDto {
  @IsUUID()
  fromAccId: string;

  @IsUUID()
  toAccId: string;
}

export class CreateContraVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateContraVoucherItemDto)
  vouchers: CreateContraVoucherItemDto[];
}

export class UpdateContraVoucherDto extends PartialType(CreateContraVoucherItemDto) {}
