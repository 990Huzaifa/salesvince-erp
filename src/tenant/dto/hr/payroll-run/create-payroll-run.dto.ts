import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreatePayrollRunDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  periodMonth: number;

  @IsOptional()
  @IsUUID()
  payPolicyId?: string;
}
