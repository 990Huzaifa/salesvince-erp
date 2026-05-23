import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod } from 'src/tenant-db/entities/voucher.entity';

export class VoucherPaymentFieldsDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ValidateIf((o: VoucherPaymentFieldsDto) => o.paymentMethod === PaymentMethod.CHEQUE)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  chequeNumber?: string;

  @ValidateIf((o: VoucherPaymentFieldsDto) => o.paymentMethod === PaymentMethod.CHEQUE)
  @IsDateString()
  chequeDate?: string;

  @ValidateIf((o: VoucherPaymentFieldsDto) => o.paymentMethod === PaymentMethod.CHEQUE)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  bankName?: string;

  @IsDateString()
  paymentDate: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  paymentAmount: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class PartyVoucherPaymentFieldsDto extends VoucherPaymentFieldsDto {
  @IsUUID()
  partyId: string;

  @IsUUID()
  accId: string;
}

export class ReturnPartyVoucherPaymentFieldsDto extends PartyVoucherPaymentFieldsDto {
  @IsUUID()
  @IsOptional()
  invoiceId?: string;
}
