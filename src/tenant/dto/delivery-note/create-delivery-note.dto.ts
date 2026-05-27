import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryNoteStatus } from 'src/tenant-db/entities/delivery-note.entity';
import { CreateDeliveryNoteItemDto } from './create-delivery-note-item.dto';

const CREATE_DELIVERY_NOTE_STATUSES = [
  DeliveryNoteStatus.PENDING,
  DeliveryNoteStatus.APPROVED,
] as const;

export class CreateDeliveryNoteDto {
  @IsUUID()
  saleOrderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryNoteNumber?: string;

  @IsDateString()
  deliveryNoteDate: string;

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
  @IsIn(CREATE_DELIVERY_NOTE_STATUSES)
  status?: DeliveryNoteStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryNoteItemDto)
  items?: CreateDeliveryNoteItemDto[];
}
