import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStockAdjustmentDto } from './create-stock-adjustment.dto';
import { CreateStockAdjustmentItemDto } from './create-stock-adjustment-item.dto';

export class UpdateStockAdjustmentDto extends PartialType(
  OmitType(CreateStockAdjustmentDto, ['items', 'status'] as const),
) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockAdjustmentItemDto)
  items?: CreateStockAdjustmentItemDto[];
}
