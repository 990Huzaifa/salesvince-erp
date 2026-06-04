import { IsOptional, IsUUID } from 'class-validator';
import { ReportPaginationQueryDto } from './report-pagination.query.dto';

export class ReportOutstandingDocumentsQueryDto extends ReportPaginationQueryDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;
}
