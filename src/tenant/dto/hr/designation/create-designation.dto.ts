import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDesignationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}
