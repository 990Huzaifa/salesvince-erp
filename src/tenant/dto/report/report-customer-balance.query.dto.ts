import { IsOptional, IsUUID } from 'class-validator';
import { ReportPaginationQueryDto } from './report-pagination.query.dto';

export class ReportCustomerBalanceQueryDto extends ReportPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  cityId?: string;
}
