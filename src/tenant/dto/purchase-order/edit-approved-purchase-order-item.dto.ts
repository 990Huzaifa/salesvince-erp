import {
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class EditApprovedPurchaseOrderItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsNumber()
  @Min(0)
  purchaseUnitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
