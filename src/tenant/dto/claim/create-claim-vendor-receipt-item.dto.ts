import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ClaimDiscardType,
  ClaimSettlementType,
} from 'src/tenant-db/entities/claim/claim.entity';

export class CreateClaimVendorReceiptItemDto {
  @IsUUID()
  claimItemId: string;

  @IsOptional()
  @IsUUID()
  shipmentItemId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  acceptedQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rejectedQuantity: number;

  @ValidateIf((o: CreateClaimVendorReceiptItemDto) => o.acceptedQuantity > 0)
  @IsEnum(ClaimSettlementType)
  returnType?: ClaimSettlementType | null;

  @ValidateIf(
    (o: CreateClaimVendorReceiptItemDto) =>
      o.returnType === ClaimSettlementType.CREDIT,
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  creditAmount?: number;

  @ValidateIf((o: CreateClaimVendorReceiptItemDto) => o.rejectedQuantity > 0)
  @IsOptional()
  @IsUUID()
  rejectReasonId?: string | null;

  @ValidateIf((o: CreateClaimVendorReceiptItemDto) => o.rejectedQuantity > 0)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectReason?: string | null;

  @ValidateIf((o: CreateClaimVendorReceiptItemDto) => o.rejectedQuantity > 0)
  @IsEnum(ClaimDiscardType)
  rejectedAction?: ClaimDiscardType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
