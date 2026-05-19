import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateUomDto {
  @IsString()
  name: string;
}
