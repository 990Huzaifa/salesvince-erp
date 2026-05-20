import { IsInt, IsUUID, Min } from 'class-validator';

export class CreatePurchaseQuotationItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  uomId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsInt()
  @Min(0)
  unitPrice: number;
}
