import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  InstallmentFrequency,
  LoanInterestType,
  LoanType,
} from 'src/tenant-db/entities/loan.entity';

export class CreateLoanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  loanName: string;

  @IsOptional()
  @IsEnum(LoanType)
  loanType?: LoanType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  loanNumber?: string;

  @IsUUID()
  @IsNotEmpty()
  loanAccId: string;

  @IsUUID()
  @IsNotEmpty()
  receivingAccId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0.01)
  principalAmount: number;

  @IsOptional()
  @IsEnum(LoanInterestType)
  interestType?: LoanInterestType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  interestValue?: number;

  @IsOptional()
  @IsEnum(InstallmentFrequency)
  installmentFrequency?: InstallmentFrequency;

  @ValidateIf((dto: CreateLoanDto) => dto.installmentFrequency === InstallmentFrequency.CUSTOM)
  @IsNumber()
  @Min(1)
  customInstallmentIntervalDays?: number;
}
