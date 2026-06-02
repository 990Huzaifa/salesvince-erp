import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetupTenantUserDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  tenantCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  fcmToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}
