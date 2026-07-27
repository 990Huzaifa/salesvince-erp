import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class TenantForgotPasswordDto {
  @IsEmail()
  email: string;

  /** Used when Host has no tenant subdomain (e.g. mobile). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;
}
