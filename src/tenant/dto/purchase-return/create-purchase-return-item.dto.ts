import { IsInt, IsUUID, Min } from 'class-validator';

export class CreatePurchaseReturnItemDto {
  @IsUUID()
  purchaseInvoiceItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
