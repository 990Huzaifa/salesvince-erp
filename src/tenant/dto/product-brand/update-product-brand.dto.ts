import { IsOptional, IsString } from 'class-validator';

export class UpdateProductBrandDto {
  @IsString()
  @IsOptional()
  name?: string;
}
