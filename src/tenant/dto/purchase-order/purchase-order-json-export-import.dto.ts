import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  JsonExportEnvelopeBaseDto,
  JsonImportMode,
  JsonImportOptionsDto,
} from '../import-export/json-export-envelope.dto';

export class PurchaseOrderJsonLineItemDto {
  @IsString()
  @MaxLength(100)
  skuCode: string;

  @IsString()
  @MaxLength(100)
  uomName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  productFlavourName?: string | null;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchaseUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  saleUnitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;
}

export class PurchaseOrderJsonItemDto {
  @IsString()
  @MaxLength(50)
  orderNumber: string;

  @IsDateString()
  orderDate: string;

  @IsString()
  @MaxLength(50)
  vendorCode: string;

  @IsString()
  @MaxLength(50)
  warehouseCode: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  deliveryCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  taxAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderJsonLineItemDto)
  items: PurchaseOrderJsonLineItemDto[];
}

export class PurchaseOrderJsonImportDto extends JsonExportEnvelopeBaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => JsonImportOptionsDto)
  options?: JsonImportOptionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderJsonItemDto)
  items: PurchaseOrderJsonItemDto[];
}

export { JsonImportMode };
