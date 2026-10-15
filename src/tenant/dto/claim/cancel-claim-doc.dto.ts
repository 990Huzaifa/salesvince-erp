import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelClaimDocDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null;
}