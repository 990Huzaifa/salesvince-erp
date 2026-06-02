import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateEmployeeSalaryStructureDto } from './create-employee-salary-structure.dto';

export class UpdateEmployeeSalaryStructureDto extends PartialType(
  OmitType(CreateEmployeeSalaryStructureDto, ['employeeId'] as const),
) {}
