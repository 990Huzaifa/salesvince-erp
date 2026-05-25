import { IsOptional, IsUUID } from 'class-validator';
import { CreateSaleOrderItemDto } from './create-sale-order-item.dto';

export class UpdateSaleOrderItemDto extends CreateSaleOrderItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}
