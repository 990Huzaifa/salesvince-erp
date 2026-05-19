import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateProductPricingDto {
  @IsUUID()
  uomId: string;

  @IsString()
  purchaseUnitPrice: string;

  @IsString()
  saleUnitPrice: string;

  @IsInt()
  quantity: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
