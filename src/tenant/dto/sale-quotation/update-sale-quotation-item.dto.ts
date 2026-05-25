import { IsOptional, IsUUID } from 'class-validator';
import { CreateSaleQuotationItemDto } from './create-sale-quotation-item.dto';

export class UpdateSaleQuotationItemDto extends CreateSaleQuotationItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}
