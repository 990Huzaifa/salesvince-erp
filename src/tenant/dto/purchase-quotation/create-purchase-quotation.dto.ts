import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePurchaseQuotationItemDto } from './create-purchase-quotation-item.dto';

export class CreatePurchaseQuotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  quotationNumber?: string;

  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @IsUUID()
  @IsNotEmpty()
  businessId: string;

  @IsDateString()
  quotationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseQuotationItemDto)
  items: CreatePurchaseQuotationItemDto[];
}
