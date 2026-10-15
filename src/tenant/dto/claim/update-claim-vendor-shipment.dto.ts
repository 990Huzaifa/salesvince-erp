import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateClaimVendorShipmentItemDto } from './create-claim-vendor-shipment-item.dto';

export class UpdateClaimVendorShipmentDto {
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

  /** When provided, replaces all shipment lines (PENDING only). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimVendorShipmentItemDto)
  items?: CreateClaimVendorShipmentItemDto[];
}
