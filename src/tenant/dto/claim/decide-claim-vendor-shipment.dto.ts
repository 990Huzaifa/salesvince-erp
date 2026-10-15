import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { DecideClaimVendorShipmentItemDto } from './decide-claim-vendor-shipment-item.dto';

export class DecideClaimVendorShipmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DecideClaimVendorShipmentItemDto)
  items: DecideClaimVendorShipmentItemDto[];
}
