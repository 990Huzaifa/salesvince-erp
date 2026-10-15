import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ClaimCostBorneBy,
  ClaimCostLinkedDocType,
} from 'src/tenant-db/entities/claim/claim-additional-costs.entity';

export class CreateClaimAdditionalCostDto {
  @IsUUID()
  claimId: string;

  @IsOptional()
  @IsDateString()
  costDate?: string;

  @IsEnum(ClaimCostLinkedDocType)
  linkedDocType: ClaimCostLinkedDocType;

  @IsUUID()
  linkedDocId: string;

  @IsOptional()
  @IsUUID()
  costTypeId?: string | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(ClaimCostBorneBy)
  borneBy: ClaimCostBorneBy;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
