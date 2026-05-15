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

export class UpdateSchemeSlabDto {
  @IsInt()
  @Min(0)
  minQuantity: number;

  @IsInt()
  @Min(0)
  maxQuantity: number;

  @IsString()
  benefitValue: string;
}

export class UpdateSchemeProductDto {
  @IsUUID('4')
  productId: string;

  @IsUUID('4')
  productPricingId: string;
}

export class UpdateSchemeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(SchemeType)
  schemeType?: SchemeType;

  @IsOptional()
  @IsEnum(BenefitType)
  benefitType?: BenefitType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSchemeSlabDto)
  slabs?: UpdateSchemeSlabDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  retailerIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSchemeProductDto)
  schemeProducts?: UpdateSchemeProductDto[];

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
