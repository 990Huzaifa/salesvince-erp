import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  OvertimeRateTypeEnum,
  PayCycleEnum,
  PayrollTypeEnum,
  SalaryCalculationTypeEnum,
  WorkingDaysTypeEnum,
} from 'src/tenant-db/entities/hr/hr.enums';
import { PayPolicyComponentItemDto } from '../shared/pay-policy-component-item.dto';

export class CreatePayPolicyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PayrollTypeEnum)
  payrollType?: PayrollTypeEnum;

  @IsOptional()
  @IsEnum(PayCycleEnum)
  payCycle?: PayCycleEnum;

  @IsOptional()
  @IsEnum(SalaryCalculationTypeEnum)
  salaryCalculationType?: SalaryCalculationTypeEnum;

  @IsOptional()
  @IsEnum(WorkingDaysTypeEnum)
  workingDaysType?: WorkingDaysTypeEnum;

  @IsOptional()
  @IsInt()
  @Min(1)
  fixedWorkingDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  workingHoursPerDay?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  overtimeAllowed?: boolean;

  @IsOptional()
  @IsEnum(OvertimeRateTypeEnum)
  overtimeRateType?: OvertimeRateTypeEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overtimeRate?: number;

  @IsOptional()
  @IsBoolean()
  lateDeductionAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  absentDeductionAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  halfDayDeductionAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  taxApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  providentFundApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  eobiApplicable?: boolean;

  @IsOptional()
  @IsBoolean()
  socialSecurityApplicable?: boolean;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;

  @IsOptional()
  @IsUUID()
  payableAccountId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayPolicyComponentItemDto)
  components?: PayPolicyComponentItemDto[];
}
