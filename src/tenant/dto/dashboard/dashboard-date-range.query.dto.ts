import { IsDateString, IsOptional } from 'class-validator';

export class DashboardDateRangeQueryDto {
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
