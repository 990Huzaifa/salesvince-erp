import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export enum ClaimVendorItemDecision {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export class ReceiveFromVendorItemDto {
  @IsUUID()
  claimItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(ClaimVendorItemDecision)
  decision: ClaimVendorItemDecision;

  /** Required when decision = REJECTED (stored on shipment item). */
  @ValidateIf(
    (o: ReceiveFromVendorItemDto) =>
      o.decision === ClaimVendorItemDecision.REJECTED,
  )
  @IsString()
  @MaxLength(2000)
  rejectReason?: string | null;

  @IsOptional()
  @IsUUID()
  shipmentItemId?: string;
}
