import { IsString, IsUUID } from 'class-validator';

export class CreateProductSubCategoryDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsUUID()
  categoryId: string;
}
