import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateOpeningStockItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productFlavourId: number;

  @IsUUID()
  productPricingId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
