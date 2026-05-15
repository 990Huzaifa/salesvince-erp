import { IsUUID } from 'class-validator';

export class AssignBusinessMemberDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  roleId: string;
}
