import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTenantBusinessDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsUUID('4')
  assetId?: string;
}
