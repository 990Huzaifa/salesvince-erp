import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class TenantVerifyForgotPasswordOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'OTP must be a 4-digit code' })
  otp: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /** Used when Host has no tenant subdomain (e.g. mobile). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  tenantCode?: string;
}
