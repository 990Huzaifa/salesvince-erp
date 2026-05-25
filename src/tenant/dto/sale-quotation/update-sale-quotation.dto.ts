import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSaleQuotationDto } from './create-sale-quotation.dto';
import { UpdateSaleQuotationItemDto } from './update-sale-quotation-item.dto';

export class UpdateSaleQuotationDto extends PartialType(
  CreateSaleQuotationDto,
) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleQuotationItemDto)
  items?: UpdateSaleQuotationItemDto[];
}
