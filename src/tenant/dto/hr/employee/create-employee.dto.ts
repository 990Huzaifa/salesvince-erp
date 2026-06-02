import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  EmployeeStatusEnum,
  EmploymentTypeEnum,
  GenderEnum,
  MaritalStatusEnum,
  SalaryPaymentMethodEnum,
} from 'src/tenant-db/entities/hr/hr.enums';

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;

  @IsUUID()
  departmentId: string;

  @IsUUID()
  designationId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnic?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(GenderEnum)
  gender?: GenderEnum;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(MaritalStatusEnum)
  maritalStatus?: MaritalStatusEnum;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsDateString()
  joiningDate: string;

  @IsOptional()
  @IsDateString()
  leavingDate?: string;

  @IsOptional()
  @IsEnum(EmploymentTypeEnum)
  employmentType?: EmploymentTypeEnum;

  @IsOptional()
  @IsEnum(EmployeeStatusEnum)
  employeeStatus?: EmployeeStatusEnum;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  reportingManagerId?: string;

  @IsOptional()
  @IsUUID()
  payPolicyId?: string;

  @IsOptional()
  @IsEnum(SalaryPaymentMethodEnum)
  salaryPaymentMethod?: SalaryPaymentMethodEnum;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankAccountTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNumber?: string;

  @IsOptional()
  @IsUUID()
  salaryAccountId?: string;
}
