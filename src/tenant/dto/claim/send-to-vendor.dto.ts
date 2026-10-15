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

export class SendToVendorDto {
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
   * Optional. When omitted, all claim items are shipped at full remaining qty.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimVendorShipmentItemDto)
  items?: CreateClaimVendorShipmentItemDto[];
}
