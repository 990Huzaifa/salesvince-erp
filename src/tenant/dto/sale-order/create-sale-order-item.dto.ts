import {
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSaleOrderItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  uomId: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saleMarginAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saleMarginPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;
}
