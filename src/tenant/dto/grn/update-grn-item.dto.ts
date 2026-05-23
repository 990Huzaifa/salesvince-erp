import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateGrnItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  purchaseOrderItemId: string;

  @IsInt()
  @Min(0)
  receivedQuantity: number;
}
