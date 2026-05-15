import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from 'src/master-db/entities/invoice.entity';

export class CreateInvoicePaymentDto {
  @IsDateString()
  paymentDate: Date;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  remarks?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reference?: string;
}
