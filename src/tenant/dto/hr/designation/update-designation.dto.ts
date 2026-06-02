import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDesignationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
}
