import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from 'src/tenant-db/entities/saleorder.entity';
import { CreateSaleOrderItemDto } from './create-saleorder-item.dto';

export class CreateSaleOrderDto {
  @IsUUID()
  distributorId: string;

  @IsUUID()
  salesmanId: string;

  @IsUUID()
  retailerId: string;

  @IsUUID()
  routeId: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  orderTotal: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsUUID()
  schemeId?: string;

  @IsOptional()
  @IsUUID()
  schemeSlabId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsDateString()
  orderDate: string;

  @IsOptional()
  @IsDateString()
  executedDate?: string;

  @IsOptional()
  @IsDateString()
  deliveredDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleOrderItemDto)
  items: CreateSaleOrderItemDto[];
}
