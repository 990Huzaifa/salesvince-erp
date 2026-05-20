import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateSimplePurchaseOrderItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  uomId: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
