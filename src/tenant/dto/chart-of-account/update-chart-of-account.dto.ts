import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateChartOfAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @IsBoolean()
  @IsOptional()
  isPostable?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  parentCode?: string | null;
}
