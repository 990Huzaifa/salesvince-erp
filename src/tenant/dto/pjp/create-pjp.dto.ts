import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePjpRouteDto {
  @IsUUID()
  routeId: string;

  @IsDateString()
  visitDate: string;
}

export class CreatePjpDto {
  @IsDateString()
  weekStartDate: string;

  @IsDateString()
  weekEndDate: string;

  @IsOptional()
  @IsUUID()
  salesmanId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePjpRouteDto)
  routes: CreatePjpRouteDto[];
}
