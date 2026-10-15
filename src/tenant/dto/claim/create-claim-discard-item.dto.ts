import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ClaimDiscardType } from 'src/tenant-db/entities/claim/claim.entity';

export class CreateClaimDiscardItemDto {
  @IsUUID()
  claimItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsUUID()
  discardReasonId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;

  @IsOptional()
  @IsEnum(ClaimDiscardType)
  action?: ClaimDiscardType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
