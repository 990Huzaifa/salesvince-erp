import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePurchaseOrderItemDto } from './create-purchase-order-item.dto';

export class CreatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderNumber?: string;

  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @IsUUID()
  @IsNotEmpty()
  vendorId: string;

  @IsDateString()
  orderDate: string;

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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
