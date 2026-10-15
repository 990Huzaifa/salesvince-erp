import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateClaimDiscardItemDto } from './create-claim-discard-item.dto';

export class CreateClaimDiscardDto {
  @IsUUID()
  claimId: string;

  @IsOptional()
  @IsDateString()
  discardDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateClaimDiscardItemDto)
  items: CreateClaimDiscardItemDto[];
}
