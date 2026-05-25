import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateSaleQuotationItemDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  uomId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
