import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

export class SaleAnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{1,2}$/, {
    message: 'date must be in YYYY-M or YYYY-MM format',
  })
  date: string;

  @IsIn(['daily', 'weekly'])
  graph_filter: 'daily' | 'weekly' = 'daily';
}
