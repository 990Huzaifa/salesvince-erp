import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStockTransferDto } from './create-stock-transfer.dto';
import { CreateStockTransferItemDto } from './create-stock-transfer-item.dto';

export class UpdateStockTransferDto extends PartialType(
  OmitType(CreateStockTransferDto, ['status', 'items'] as const),
) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferItemDto)
  items?: CreateStockTransferItemDto[];
}
