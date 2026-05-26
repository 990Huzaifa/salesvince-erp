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
import { CreateSaleQuotationItemDto } from './create-sale-quotation-item.dto';

export class CreateSaleQuotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  quotationNumber?: string;

  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsDateString()
  quotationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleQuotationItemDto)
  items: CreateSaleQuotationItemDto[];
}
