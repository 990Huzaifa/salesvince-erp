import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateUomDto {
  @IsString()
  @IsOptional()
  name?: string;
}
