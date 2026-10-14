import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClaimItemDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productFlavourId?: number | null;

  @IsUUID()
  uomId: string;

  @IsUUID()
  warehouseId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  claimedQuantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
