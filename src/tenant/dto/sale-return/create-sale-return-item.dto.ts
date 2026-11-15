import {
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleReturnItemDto {
  /** Invoice mode: line from sale invoice */
  @ValidateIf((o: CreateSaleReturnItemDto) => !o.productId)
  @IsUUID()
  saleInvoiceItemId?: string;

  /** Customer mode: manual product line */
  @ValidateIf((o: CreateSaleReturnItemDto) => !o.saleInvoiceItemId)
  @IsUUID()
  productId?: string;

  @ValidateIf((o: CreateSaleReturnItemDto) => !o.saleInvoiceItemId)
  @IsUUID()
  uomId?: string;

  @ValidateIf((o: CreateSaleReturnItemDto) => !o.saleInvoiceItemId)
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @ValidateIf((o: CreateSaleReturnItemDto) => !o.saleInvoiceItemId)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
