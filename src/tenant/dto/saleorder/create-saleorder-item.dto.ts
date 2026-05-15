import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateSaleOrderItemDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  productFlavourId: number;

  @IsUUID()
  productPricingId: string;

  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @IsOptional()
  @IsUUID()
  slabId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount: number;
}
