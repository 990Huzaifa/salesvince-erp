import { IsString } from 'class-validator';

export class CreateRetailerCategoryDto {
  @IsString()
  name: string;
}
