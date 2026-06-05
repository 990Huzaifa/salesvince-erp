import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ComponentCalculationTypeEnum,
  ComponentTypeEnum,
} from 'src/tenant-db/entities/hr/hr.enums';

export class CreateSalaryComponentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsEnum(ComponentTypeEnum)
  componentType: ComponentTypeEnum;

  @IsOptional()
  @IsEnum(ComponentCalculationTypeEnum)
  calculationType?: ComponentCalculationTypeEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultValue?: number;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
