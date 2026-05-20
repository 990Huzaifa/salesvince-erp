import { IsOptional, IsUUID } from 'class-validator';
import { CreatePurchaseOrderItemDto } from './create-purchase-order-item.dto';

export class UpdatePurchaseOrderItemDto extends CreatePurchaseOrderItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}
