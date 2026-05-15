import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdatePjpRouteDto {
  @IsUUID()
  routeId: string;

  @IsDateString()
  visitDate: string;
}

export class UpdatePjpDto {
  @IsOptional()
  @IsDateString()
  weekStartDate?: string;

  @IsOptional()
  @IsDateString()
  weekEndDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePjpRouteDto)
  routes?: UpdatePjpRouteDto[];
}
