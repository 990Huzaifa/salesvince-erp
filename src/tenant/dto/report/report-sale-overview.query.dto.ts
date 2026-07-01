import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReportSaleOverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}
