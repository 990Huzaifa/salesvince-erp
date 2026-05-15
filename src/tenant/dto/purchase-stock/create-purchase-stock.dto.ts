import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreatePurchaseStockItemDto } from './create-purchase-stock-item.dto';

export class CreatePurchaseStockDto {
  @IsUUID()
  distributorId: string;

  @IsDateString()
  date: string;

  @IsString()
  @IsOptional()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseStockItemDto)
  items: CreatePurchaseStockItemDto[];
}
