import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProductSubCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;
}
