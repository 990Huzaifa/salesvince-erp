import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateGrnItemDto {
  @IsUUID()
  purchaseOrderItemId: string;

  @IsInt()
  @Min(0)
  receivedQuantity: number;
}
