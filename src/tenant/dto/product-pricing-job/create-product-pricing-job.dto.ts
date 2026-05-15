import { IsDateString, IsNumber, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateProductPricingJobDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  productPricingId: string;

  @IsDateString()
  startDate: string;

  @IsString()
  @MinLength(1)
  tradePrice: string;

  @IsString()
  @MinLength(1)
  retailPrice: string;

  @IsNumber()
  quantity: number;
}
