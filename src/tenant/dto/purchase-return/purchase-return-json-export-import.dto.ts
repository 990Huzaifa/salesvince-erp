import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
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

export class PurchaseReturnJsonLineItemDto {
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
}

export class PurchaseReturnJsonItemDto {
  @IsString()
  @MaxLength(50)
  returnNumber: string;

  @IsDateString()
  returnDate: string;

  @IsString()
  @MaxLength(2000)
  returnReason: string;

  @IsString()
  @MaxLength(50)
  purchaseInvoiceNumber: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnJsonLineItemDto)
  items: PurchaseReturnJsonLineItemDto[];
}

export class PurchaseReturnJsonImportDto extends JsonExportEnvelopeBaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => JsonImportOptionsDto)
  options?: JsonImportOptionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnJsonItemDto)
  items: PurchaseReturnJsonItemDto[];
}

export { JsonImportMode };
