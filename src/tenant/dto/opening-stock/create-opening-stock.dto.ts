import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOpeningStockItemDto } from './create-opening-stock-item.dto';

export class CreateOpeningStockDto {
  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  openingNumber?: string;

  @IsDateString()
  openingDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOpeningStockItemDto)
  items: CreateOpeningStockItemDto[];
}
