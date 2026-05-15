import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateTenantRoleDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];
}
