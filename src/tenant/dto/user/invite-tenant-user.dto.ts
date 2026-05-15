import { IsEmail, IsUUID } from 'class-validator';

export class InviteTenantUserDto {
  @IsEmail()
  email: string;

  @IsUUID()
  businessId: string;

  @IsUUID()
  roleId: string;
}
