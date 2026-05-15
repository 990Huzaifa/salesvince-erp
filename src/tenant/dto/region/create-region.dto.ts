import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateRegionDto {
  @IsString()
  cityId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
