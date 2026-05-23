import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateGrnDto } from './create-grn.dto';
import { UpdateGrnItemDto } from './update-grn-item.dto';

export class UpdateGrnDto extends PartialType(CreateGrnDto) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateGrnItemDto)
  items?: UpdateGrnItemDto[];
}
