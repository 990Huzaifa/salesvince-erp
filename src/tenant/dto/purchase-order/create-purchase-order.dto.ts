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

  /** Header discount amount; computed from discountPercentage when omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  /** Header tax amount; computed from taxPercentage when omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  /**
   * Document-level discount total (line + header). Used on GRN/invoice when provided;
   * otherwise calculated on the backend.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalDiscountAmount?: number;

  /**
   * Document-level tax total. Used on GRN/invoice when provided;
   * otherwise calculated on the backend.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalTaxAmount?: number;

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
