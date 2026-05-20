import { IsOptional, IsUUID } from 'class-validator';
import { CreatePurchaseQuotationItemDto } from './create-purchase-quotation-item.dto';

export class UpdatePurchaseQuotationItemDto extends CreatePurchaseQuotationItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}
