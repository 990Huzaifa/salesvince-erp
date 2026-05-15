import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod, SaleVoucherStatus } from 'src/tenant-db/entities/sale-voucher.entity';

export class CreateSaleVoucherDto {
  @IsUUID()
  retailerId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  chequeNumber?: string;

  @IsOptional()
  @IsDateString()
  chequeDate?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsDateString()
  paymentDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  paymentAmount: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  /** Omit or `PENDING` for draft; `PAID` creates the voucher and posts the retailer ledger in one step. */
  @IsOptional()
  @IsIn([SaleVoucherStatus.PENDING, SaleVoucherStatus.PAID])
  status?: SaleVoucherStatus;
}
