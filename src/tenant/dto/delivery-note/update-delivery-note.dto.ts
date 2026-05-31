import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateDeliveryNoteDto } from './create-delivery-note.dto';
import { UpdateDeliveryNoteItemDto } from './update-delivery-note-item.dto';

export class UpdateDeliveryNoteDto extends PartialType(CreateDeliveryNoteDto) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateDeliveryNoteItemDto)
  items?: UpdateDeliveryNoteItemDto[];
}
