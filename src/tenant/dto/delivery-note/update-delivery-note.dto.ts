import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateDeliveryNoteItemDto } from './update-delivery-note-item.dto';

export class UpdateDeliveryNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryNoteNumber?: string;

  @IsOptional()
  @IsDateString()
  deliveryNoteDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateDeliveryNoteItemDto)
  items?: UpdateDeliveryNoteItemDto[];
}
