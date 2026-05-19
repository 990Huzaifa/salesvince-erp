import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ChartOfAccountType } from 'src/tenant-db/chart-of-accounts/constants/chart-of-account-type.enum';

export class CreateChartOfAccountDto {
  @IsEnum(ChartOfAccountType)
  type: ChartOfAccountType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  openingBalance?: number;
}
