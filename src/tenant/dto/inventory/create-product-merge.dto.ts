import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductMergeSourceLineDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  productId: string;

  @IsUUID()
  uomId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class ProductMergeResultDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  productId: string;

  @IsUUID()
  uomId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  purchaseUnitPrice: number;

  @IsNumber()
  @Min(0)
  saleUnitMarginAmount: number;

  @IsNumber()
  @Min(0)
  saleUnitMarginPercentage: number;
}

export class CreateProductMergeDto {
  @IsOptional()
  @IsDateString()
  mergeDate?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ProductMergeSourceLineDto)
  sourceLines: ProductMergeSourceLineDto[];

  @ValidateNested()
  @Type(() => ProductMergeResultDto)
  result: ProductMergeResultDto;
}
