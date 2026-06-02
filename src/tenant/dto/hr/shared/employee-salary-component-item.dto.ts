import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import {
  ComponentCalculationTypeEnum,
  ComponentTypeEnum,
} from 'src/tenant-db/entities/hr/hr.enums';

export class EmployeeSalaryComponentItemDto {
  @IsUUID()
  salaryComponentId: string;

  @IsEnum(ComponentTypeEnum)
  componentType: ComponentTypeEnum;

  @IsEnum(ComponentCalculationTypeEnum)
  calculationType: ComponentCalculationTypeEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsNumber()
  @Min(0)
  calculatedAmount: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
