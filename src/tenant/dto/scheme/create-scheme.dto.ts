import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BenefitType, SchemeType } from 'src/tenant-db/entities/scheme.entity';

export class CreateSchemeSlabDto {
  @IsInt()
  @Min(0)
  minQuantity: number;

  @IsInt()
  @Min(0)
  maxQuantity: number;

  @IsString()
  benefitValue: string;
}

export class CreateSchemeProductDto {
  @IsUUID('4')
  productId: string;

  @IsUUID('4')
  productPricingId: string;
}

export class CreateSchemeDto {
  @IsString()
  name: string;

  @IsEnum(SchemeType)
  schemeType: SchemeType;

  @IsEnum(BenefitType)
  benefitType: BenefitType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSchemeSlabDto)
  slabs?: CreateSchemeSlabDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  retailerIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSchemeProductDto)
  schemeProducts?: CreateSchemeProductDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  productCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  retailerChannelIds?: string[];
}
