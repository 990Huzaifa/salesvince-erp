import { IsEnum } from 'class-validator';
import { LoanStatus } from 'src/tenant-db/entities/loan.entity';

export class UpdateLoanStatusDto {
  @IsEnum(LoanStatus)
  status: LoanStatus;
}
