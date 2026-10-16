import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BatchPickStrategy,
  ProductPricingType,
} from 'src/tenant-db/entities/product.entity';
import {
  JsonExportEnvelopeBaseDto,
  JsonImportMode,
  JsonImportOptionsDto,
} from '../import-export/json-export-envelope.dto';

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return value as boolean;
}

export class NamedRefDto {
  @IsString()
  name: string;
}

export class ProductJsonPricingItemDto {
  @ValidateNested()
  @Type(() => NamedRefDto)
  uom: NamedRefDto;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;

  @IsOptional()
  @IsEnum(ProductPricingType)
  pricingType?: ProductPricingType;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Type(() => Number)
  purchaseUnitPrice: number;

  /** Optional; if provided with purchase, margin fields are derived when margins omitted. */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  saleUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  saleUnitMarginAmount?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  saleUnitMarginPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  purchasePercentage?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  salePercentage?: number;
}

export class ProductJsonItemDto {
  @IsOptional()
  @IsString()
  skuCode?: string | null;

  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  hsCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(BatchPickStrategy)
  batchPickStrategy?: BatchPickStrategy;

  @ValidateNested()
  @Type(() => NamedRefDto)
  category: NamedRefDto;

  @ValidateNested()
  @Type(() => NamedRefDto)
  subCategory: NamedRefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NamedRefDto)
  brand?: NamedRefDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NamedRefDto)
  flavours?: NamedRefDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductJsonPricingItemDto)
  pricing: ProductJsonPricingItemDto[];
}

export class ProductJsonImportDto extends JsonExportEnvelopeBaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => JsonImportOptionsDto)
  options?: JsonImportOptionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductJsonItemDto)
  items: ProductJsonItemDto[];
}

export class ProductJsonExportQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toOptionalBoolean(value))
  isActive?: boolean;
}

export { JsonImportMode };
