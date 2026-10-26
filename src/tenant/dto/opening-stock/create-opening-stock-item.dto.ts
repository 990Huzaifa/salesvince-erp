import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOpeningStockItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @IsUUID()
  uomId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  purchaseUnitPrice: number;

  @IsNumber()
  @Min(0)
  saleUnitPrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
