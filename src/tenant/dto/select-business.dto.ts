import { IsUUID } from 'class-validator';

export class SelectBusinessDto {
  @IsUUID()
  businessId: string;
}
