import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetupTenantUserPasswordDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;
}
