import { IsString } from 'class-validator';

export class CreateProductSubCategoryDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;
}
