import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePurchaseReturnItemDto } from './create-purchase-return-item.dto';

export class CreatePurchaseReturnDto {
  @IsUUID()
  purchaseInvoiceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  returnNumber?: string;

  @IsDateString()
  returnDate: string;

  @IsString()
  @MaxLength(2000)
  returnReason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnItemDto)
  items: CreatePurchaseReturnItemDto[];
}
