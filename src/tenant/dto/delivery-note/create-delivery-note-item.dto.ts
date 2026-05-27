import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateDeliveryNoteItemDto {
  @IsUUID()
  saleOrderItemId: string;

  @IsInt()
  @Min(0)
  deliveredQuantity: number;
}
