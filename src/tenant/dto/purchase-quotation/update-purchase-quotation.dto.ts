import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePurchaseQuotationDto } from './create-purchase-quotation.dto';
import { CreatePurchaseQuotationItemDto } from './create-purchase-quotation-item.dto';

export class UpdatePurchaseQuotationDto extends PartialType(
  CreatePurchaseQuotationDto,
) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseQuotationItemDto)
  items?: CreatePurchaseQuotationItemDto[];
}
