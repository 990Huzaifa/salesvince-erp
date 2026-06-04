import {
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class EditApprovedSaleOrderItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  purchaseUnitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saleMarginAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  saleMarginPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
