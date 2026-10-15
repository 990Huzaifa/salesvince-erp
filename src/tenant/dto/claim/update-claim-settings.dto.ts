import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateClaimSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stuckAtVendorDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  waitingToGiveDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  agingBandDays?: number[];
}
