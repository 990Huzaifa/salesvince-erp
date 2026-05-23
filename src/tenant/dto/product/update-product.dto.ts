import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BatchPickStrategy } from 'src/tenant-db/entities/product.entity';

class UpdateProductPricingDto {
  @IsUUID()
  uomId: string;

  @IsNumber()
  purchaseUnitPrice: number;

  @IsNumber()
  saleUnitMarginAmount: number;

  @IsNumber()
  saleUnitMarginPercentage: number;

  @IsInt()
  quantity: number;
}

export class UpdateProductDto {

  @IsEnum(BatchPickStrategy)
  @IsOptional()
  batchPickStrategy?: BatchPickStrategy;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  subCategoryId?: string;

  @IsOptional()
  @IsString()
  skuCode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  hsCode?: string;
  
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  flavourIds?: string[] | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateProductPricingDto)
  pricing?: UpdateProductPricingDto[];
}
