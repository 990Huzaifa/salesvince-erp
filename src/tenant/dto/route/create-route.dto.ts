import { IsString, IsUUID } from 'class-validator';

export class CreateRouteDto {
  @IsUUID()
  areaId: string;

  @IsUUID()
  distributorId: string;

  @IsString()
  name: string;
}
