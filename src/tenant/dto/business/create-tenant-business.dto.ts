import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantBusinessDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  legalName?: string;
}
