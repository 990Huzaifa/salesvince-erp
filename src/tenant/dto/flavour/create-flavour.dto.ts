import { IsString } from 'class-validator';

export class CreateFlavourDto {
  @IsString()
  name: string;
}
