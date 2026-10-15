import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ClaimVendorShipmentItemStatus } from 'src/tenant-db/entities/claim/claim-vendor-shipments.entity';

export class DecideClaimVendorShipmentItemDto {
  @IsUUID()
  shipmentItemId: string;

  @IsIn([
    ClaimVendorShipmentItemStatus.ACCEPTED,
    ClaimVendorShipmentItemStatus.REJECTED,
  ])
  status:
    | ClaimVendorShipmentItemStatus.ACCEPTED
    | ClaimVendorShipmentItemStatus.REJECTED;

  @ValidateIf(
    (o: DecideClaimVendorShipmentItemDto) =>
      o.status === ClaimVendorShipmentItemStatus.REJECTED,
  )
  @IsString()
  @MaxLength(2000)
  rejectReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
