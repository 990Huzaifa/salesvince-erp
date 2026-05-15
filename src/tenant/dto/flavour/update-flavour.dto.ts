import { IsOptional, IsString } from 'class-validator';

export class UpdateFlavourDto {
  @IsString()
  @IsOptional()
  name?: string;
}
