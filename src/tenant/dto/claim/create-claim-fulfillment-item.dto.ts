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
import { ClaimSettlementType } from 'src/tenant-db/entities/claim/claim.entity';

export class CreateClaimFulfillmentItemDto {
  @IsUUID()
  claimItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsEnum(ClaimSettlementType)
  settlementType?: ClaimSettlementType | null;

  @ValidateIf(
    (o: CreateClaimFulfillmentItemDto) =>
      o.settlementType === ClaimSettlementType.CREDIT,
  )
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  creditAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
