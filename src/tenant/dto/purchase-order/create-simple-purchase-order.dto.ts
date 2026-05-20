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
import { CreateSimplePurchaseOrderItemDto } from './create-simple-purchase-order-item.dto';

export class CreateSimplePurchaseOrderDto {
  @IsUUID()
  warehouseId: string;

  @IsUUID()
  vendorId: string;

  @IsDateString()
  orderDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSimplePurchaseOrderItemDto)
  items: CreateSimplePurchaseOrderItemDto[];
}
