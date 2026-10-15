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
import { CreateClaimVendorShipmentItemDto } from './create-claim-vendor-shipment-item.dto';

export class CreateClaimVendorShipmentDto {
  @IsUUID()
  claimId: string;

  @IsUUID()
  vendorId: string;

  @IsOptional()
  @IsDateString()
  shipmentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proofImage?: string | null;

  /**
   * Optional. When omitted, all claim items with an active claim batch
   * are shipped at full remaining batch quantity.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimVendorShipmentItemDto)
  items?: CreateClaimVendorShipmentItemDto[];
}
