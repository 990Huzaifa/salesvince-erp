import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { RoleStatus } from 'src/tenant-db/entities/role.entity';

export class UpdateTenantRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(RoleStatus)
  @IsOptional()
  status?: RoleStatus;

  @IsArray()
  @ArrayMinSize(1)
  @IsOptional()
  @IsString({ each: true })
  permissions?: string[];
}
