import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateStockTransferItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @IsUUID()
  uomId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
