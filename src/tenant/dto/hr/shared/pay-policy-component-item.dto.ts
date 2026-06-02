import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ComponentCalculationTypeEnum } from 'src/tenant-db/entities/hr/hr.enums';

export class PayPolicyComponentItemDto {
  @IsUUID()
  salaryComponentId: string;

  @IsEnum(ComponentCalculationTypeEnum)
  calculationType: ComponentCalculationTypeEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsUUID()
  basedOnComponentId?: string;

  @IsOptional()
  @IsString()
  formula?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
