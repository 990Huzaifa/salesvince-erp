import { IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class InviteTenantUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  roleId: string;

  @IsOptional()
  @IsInt()
  designationId?: number;
}
