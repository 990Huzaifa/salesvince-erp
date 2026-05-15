import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsUUID, Min } from 'class-validator';

export class GetProductSchemesDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  productPricingId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsDateString()
  orderDate: string;
}
