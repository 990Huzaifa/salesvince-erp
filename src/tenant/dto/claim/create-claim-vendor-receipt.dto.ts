import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateClaimVendorReceiptItemDto } from './create-claim-vendor-receipt-item.dto';

export class CreateClaimVendorReceiptDto {
  @IsUUID()
  claimId: string;

  @IsUUID()
  vendorId: string;

  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proofImage?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimVendorReceiptItemDto)
  items: CreateClaimVendorReceiptItemDto[];
}
