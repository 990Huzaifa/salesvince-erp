import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class TenantLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  /** Used when Host has no tenant subdomain (e.g. mobile). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;
}
