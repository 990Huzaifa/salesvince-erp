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
import { CreateSaleReturnItemDto } from './create-sale-return-item.dto';

export class CreateSaleReturnDto {
  @IsUUID()
  saleInvoiceId: string;

  @IsUUID()
  warehouseId: string;

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
  @Type(() => CreateSaleReturnItemDto)
  items: CreateSaleReturnItemDto[];
}
