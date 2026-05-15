import { IsOptional, IsString } from 'class-validator';

export class UpdateRetailerCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;
}
