import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateChartOfAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  parentCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsBoolean()
  @IsOptional()
  isPostable?: boolean;
}
