import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClaimDiscardReasonDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
