import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateRouteDto {
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @IsUUID()
  distributorId?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
