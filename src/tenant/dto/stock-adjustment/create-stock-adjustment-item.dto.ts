import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { StockAdjustmentDirection } from 'src/tenant-db/entities/stock-adjustment.entity';

export class CreateStockAdjustmentItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @IsUUID()
  uomId: string;

  @IsEnum(StockAdjustmentDirection)
  direction: StockAdjustmentDirection;

  @IsInt()
  @Min(1)
  quantity: number;

  @ValidateIf(
    (item: CreateStockAdjustmentItemDto) =>
      item.direction === StockAdjustmentDirection.INCREASE,
  )
  @IsNumber()
  @Min(0)
  purchaseUnitPrice?: number;

  @ValidateIf(
    (item: CreateStockAdjustmentItemDto) =>
      item.direction === StockAdjustmentDirection.INCREASE,
  )
  @IsNumber()
  @Min(0)
  saleUnitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
