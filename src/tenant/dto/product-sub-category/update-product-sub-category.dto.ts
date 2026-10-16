import { IsOptional, IsString } from 'class-validator';

export class UpdateProductSubCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;
}
