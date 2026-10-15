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
  ValidateNested,
} from 'class-validator';
import { ClaimFulfillmentType } from 'src/tenant-db/entities/claim/claim-fulfillments.entity';
import { CreateClaimFulfillmentItemDto } from './create-claim-fulfillment-item.dto';

export class CreateClaimFulfillmentDto {
  @IsUUID()
  claimId: string;

  @IsEnum(ClaimFulfillmentType)
  type: ClaimFulfillmentType;

  @IsOptional()
  @IsDateString()
  fulfillmentDate?: string;

  @IsOptional()
  @IsUUID()
  partyId?: string | null;

  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receivedByName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signatureImage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  proofImage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimFulfillmentItemDto)
  items: CreateClaimFulfillmentItemDto[];
}
