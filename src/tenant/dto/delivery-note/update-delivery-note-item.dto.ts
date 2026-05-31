import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateDeliveryNoteItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  saleOrderItemId: string;

  @IsInt()
  @Min(0)
  deliveredQuantity: number;
}
