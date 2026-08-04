import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class AssignUserBusinessItemDto {
  @IsUUID()
  businessId: string;

  @IsUUID()
  roleId: string;
}

export class AssignUserBusinessesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssignUserBusinessItemDto)
  businesses: AssignUserBusinessItemDto[];
}
