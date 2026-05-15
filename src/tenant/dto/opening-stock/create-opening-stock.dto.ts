import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOpeningStockItemDto } from './create-opening-stock-item.dto';

export class CreateOpeningStockDto {
  @IsUUID()
  distributorId: string;

  @IsDateString()
  date: string;

  @IsString()
  @MinLength(1)
  remarks: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOpeningStockItemDto)
  items: CreateOpeningStockItemDto[];
}
