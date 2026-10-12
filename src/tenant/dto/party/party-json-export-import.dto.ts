import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PartyClass, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  JsonExportEnvelopeBaseDto,
  JsonImportMode,
  JsonImportOptionsDto,
} from '../import-export/json-export-envelope.dto';

export class PartyJsonItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsEnum(PartyType)
  type: PartyType;

  @IsOptional()
  @IsEnum(PartyClass)
  partyClass?: PartyClass | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsAppNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  alternatePhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ntnNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  strnNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  countryId?: string | null;

  @IsOptional()
  @IsString()
  stateId?: string | null;

  @IsOptional()
  @IsString()
  cityId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  creditLimit?: number | null;
}

export class PartyJsonImportDto extends JsonExportEnvelopeBaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => JsonImportOptionsDto)
  options?: JsonImportOptionsDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartyJsonItemDto)
  items: PartyJsonItemDto[];
}

export class PartyJsonExportQueryDto {
  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;
}

export { JsonImportMode };
