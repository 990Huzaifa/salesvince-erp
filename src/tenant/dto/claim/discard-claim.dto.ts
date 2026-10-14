import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ClaimDiscardType } from 'src/tenant-db/entities/claim.entity';

export class DiscardClaimDto {
  @IsEnum(ClaimDiscardType)
  discardType: ClaimDiscardType;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
