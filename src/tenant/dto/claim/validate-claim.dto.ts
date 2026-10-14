import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ValidateClaimDto {
  @IsBoolean()
  isValid: boolean;

  @ValidateIf((dto: ValidateClaimDto) => dto.isValid === false)
  @IsString()
  @MaxLength(2000)
  invalidReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  discardReason?: string;
}
