import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartyClass, PartyType } from 'src/tenant-db/entities/party.entity';

export class CreatePartyDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(PartyType)
  type: PartyType;

  @ValidateIf(
    (o: CreatePartyDto) =>
      o.type === PartyType.CUSTOMER || o.type === PartyType.BOTH,
  )
  @IsEnum(PartyClass)
  @IsOptional()
  partyClass?: PartyClass;

  @ValidateIf(
    (o: CreatePartyDto) =>
      o.type === PartyType.CUSTOMER || o.type === PartyType.BOTH,
  )
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  creditLimit?: number;

  @ValidateIf(
    (o: CreatePartyDto) =>
      o.type === PartyType.VENDOR || o.type === PartyType.BOTH,
  )
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  payableOpeningBalance?: number;

  @ValidateIf(
    (o: CreatePartyDto) =>
      o.type === PartyType.CUSTOMER || o.type === PartyType.BOTH,
  )
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  receivableOpeningBalance?: number;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  whatsAppNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  alternatePhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  ntnNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  strnNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  cnic?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  taxNumber?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  countryId?: string;

  @IsString()
  @IsOptional()
  stateId?: string;

  @IsString()
  @IsOptional()
  cityId?: string;
}
