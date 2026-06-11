import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BatchPickStrategy } from 'src/tenant-db/entities/product.entity';

class CreateProductAsyncPricingDto {
  @IsUUID()
  uomId: string;

  @IsNumber()
  purchaseUnitPrice: number;

  @IsNumber()
  saleUnitMarginAmount: number;

  @IsNumber()
  saleUnitMarginPercentage: number;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateProductAsyncDto {
  @IsEnum(BatchPickStrategy)
  @IsOptional()
  batchPickStrategy?: BatchPickStrategy;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsUUID()
  categoryId: string;

  @IsUUID()
  subCategoryId: string;

  @IsOptional()
  @IsString()
  skuCode?: string | null;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  flavourIds?: string[] | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductAsyncPricingDto)
  pricing: CreateProductAsyncPricingDto[];
}
