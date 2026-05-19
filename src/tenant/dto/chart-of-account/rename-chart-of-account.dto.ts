import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameChartOfAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;
}
