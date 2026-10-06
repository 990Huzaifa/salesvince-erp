import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class RequestAccountDeletionDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null && String(value).trim() !== '')
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason?: string;
}
