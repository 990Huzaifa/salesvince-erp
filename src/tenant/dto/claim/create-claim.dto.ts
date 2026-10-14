import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ClaimSourceType } from 'src/tenant-db/entities/claim.entity';
import { CreateClaimItemDto } from './create-claim-item.dto';

export class CreateClaimDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  claimNumber?: string;

  @IsDateString()
  claimDate: string;

  @IsEnum(ClaimSourceType)
  sourceType: ClaimSourceType;

  @ValidateIf((dto: CreateClaimDto) => dto.sourceType === ClaimSourceType.CUSTOMER)
  @IsUUID()
  partyId?: string;

  @ValidateIf(
    (dto: CreateClaimDto) => dto.sourceType === ClaimSourceType.OWN_LOCATION,
  )
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimItemDto)
  items: CreateClaimItemDto[];
}
