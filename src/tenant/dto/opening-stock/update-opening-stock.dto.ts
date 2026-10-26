import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOpeningStockDto } from './create-opening-stock.dto';
import { CreateOpeningStockItemDto } from './create-opening-stock-item.dto';

export class UpdateOpeningStockDto extends PartialType(
  OmitType(CreateOpeningStockDto, ['items'] as const),
) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOpeningStockItemDto)
  items?: CreateOpeningStockItemDto[];
}
