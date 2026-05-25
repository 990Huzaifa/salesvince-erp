import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleOrderDto } from './create-sale-order.dto';
import { UpdateSaleOrderItemDto } from './update-sale-order-item.dto';

export class UpdateSaleOrderDto extends PartialType(CreateSaleOrderDto) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleOrderItemDto)
  items?: UpdateSaleOrderItemDto[];
}
