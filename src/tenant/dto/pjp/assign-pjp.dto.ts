import { IsUUID } from 'class-validator';

export class AssignPjpDto {
  @IsUUID()
  userId: string;
}
