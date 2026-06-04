import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { VoucherPaymentFieldsDto } from './shared-voucher-fields.dto';

export class CreateSalaryVoucherItemDto extends VoucherPaymentFieldsDto {
  @IsUUID()
  payslipId: string;

  @IsUUID()
  accId: string;
}

export class CreateSalaryVouchersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalaryVoucherItemDto)
  vouchers: CreateSalaryVoucherItemDto[];
}

export class UpdateSalaryVoucherDto extends PartialType(
  CreateSalaryVoucherItemDto,
) {}
