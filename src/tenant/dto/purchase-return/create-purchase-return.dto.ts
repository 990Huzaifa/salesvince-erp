import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseReturnMode } from 'src/tenant-db/entities/purchase-return.entity';
import { CreatePurchaseReturnItemDto } from './create-purchase-return-item.dto';

export class CreatePurchaseReturnDto {
  @IsEnum(PurchaseReturnMode)
  returnMode: PurchaseReturnMode;

  @ValidateIf(
    (o: CreatePurchaseReturnDto) => o.returnMode === PurchaseReturnMode.INVOICE,
  )
  @IsUUID()
  purchaseInvoiceId?: string;

  @ValidateIf(
    (o: CreatePurchaseReturnDto) => o.returnMode === PurchaseReturnMode.SUPPLIER,
  )
  @IsUUID()
  vendorId?: string;

  @ValidateIf(
    (o: CreatePurchaseReturnDto) => o.returnMode === PurchaseReturnMode.SUPPLIER,
  )
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  returnNumber?: string;

  @IsDateString()
  returnDate: string;

  @IsString()
  @MaxLength(2000)
  returnReason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnItemDto)
  items: CreatePurchaseReturnItemDto[];
}
