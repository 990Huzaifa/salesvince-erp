import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  JsonExportEnvelopeBaseDto,
  JsonImportMode,
  JsonImportOptionsDto,
} from '../import-export/json-export-envelope.dto';

export class StockTransferJsonLineItemDto {
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

export class StockTransferJsonItemDto {
  @IsString()
  @MaxLength(50)
  transferNumber: string;

  @IsDateString()
  transferDate: string;

  @IsString()
  @MaxLength(50)
  fromWarehouseCode: string;

  @IsString()
  @MaxLength(50)
  toWarehouseCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferJsonLineItemDto)
  items: StockTransferJsonLineItemDto[];
}

export class StockTransferJsonImportDto extends JsonExportEnvelopeBaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => JsonImportOptionsDto)
  options?: JsonImportOptionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferJsonItemDto)
  items: StockTransferJsonItemDto[];
}

export class StockTransferJsonExportQueryDto {
  /** Comma-separated transfer UUIDs (selected rows). */
  @IsOptional()
  @IsString()
  ids?: string;

  /** Warehouse code — transfers where from OR to matches. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  warehouseCode?: string;
}

export class StockTransferJsonExportBodyDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  warehouseCode?: string;
}

export { JsonImportMode };
