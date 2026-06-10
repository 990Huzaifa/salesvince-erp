import {
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePurchaseOrderItemDto {
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
  saleUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  /** Line discount amount; computed from discountPercentage when omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
