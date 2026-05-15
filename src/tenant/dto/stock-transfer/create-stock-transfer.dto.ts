import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateStockTransferItemDto } from './create-stock-transfer-item.dto';

export class CreateStockTransferDto {
  @IsUUID()
  fromDistributorId: string;

  @IsUUID()
  toDistributorId: string;

  @IsDateString()
  date: string;

  @IsString()
  @MinLength(1)
  remarks: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferItemDto)
  items: CreateStockTransferItemDto[];
}
