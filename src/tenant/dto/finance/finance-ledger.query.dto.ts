import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportPaginationQueryDto } from '../report/report-pagination.query.dto';

export class FinanceLedgerQueryDto extends ReportPaginationQueryDto {
  @IsUUID()
  chartOfAccountId: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class FinanceAdvanceLedgerQueryDto extends FinanceLedgerQueryDto {
  @IsOptional()
  @IsIn(['credit_first', 'debit_first'])
  sortOrder?: 'credit_first' | 'debit_first';
}
