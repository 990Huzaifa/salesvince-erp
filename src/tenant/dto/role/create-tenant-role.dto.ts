import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateTenantRoleDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}
