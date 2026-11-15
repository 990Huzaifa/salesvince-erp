import {
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseReturnItemDto {
  /** Invoice mode: line from purchase invoice */
  @ValidateIf((o: CreatePurchaseReturnItemDto) => !o.productId)
  @IsUUID()
  purchaseInvoiceItemId?: string;

  /** Supplier mode: manual product line */
  @ValidateIf((o: CreatePurchaseReturnItemDto) => !o.purchaseInvoiceItemId)
  @IsUUID()
  productId?: string;

  @ValidateIf((o: CreatePurchaseReturnItemDto) => !o.purchaseInvoiceItemId)
  @IsUUID()
  uomId?: string;

  @IsOptional()
  @IsUUID()
  productFlavourId?: string;

  @ValidateIf((o: CreatePurchaseReturnItemDto) => !o.purchaseInvoiceItemId)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
