import { IsUUID } from 'class-validator';

export class ResendInviteTenantUserDto {
  @IsUUID()
  userId: string;
}
