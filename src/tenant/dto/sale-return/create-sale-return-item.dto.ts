import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateSaleReturnItemDto {
  @IsUUID()
  saleInvoiceItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
