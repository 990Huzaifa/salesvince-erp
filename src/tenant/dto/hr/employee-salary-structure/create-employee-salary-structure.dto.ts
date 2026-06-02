import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SalaryStructureStatusEnum } from 'src/tenant-db/entities/hr/hr.enums';
import { EmployeeSalaryComponentItemDto } from '../shared/employee-salary-component-item.dto';

export class CreateEmployeeSalaryStructureDto {
  @IsUUID()
  employeeId: string;

  @IsUUID()
  payPolicyId: string;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsEnum(SalaryStructureStatusEnum)
  status?: SalaryStructureStatusEnum;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeSalaryComponentItemDto)
  components: EmployeeSalaryComponentItemDto[];
}
