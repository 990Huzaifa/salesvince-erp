import { IsString } from 'class-validator';

export class CreateAreaDto {
  @IsString()
  regionId: string;

  @IsString()
  name: string;

  @IsString()
  code: string;
}
