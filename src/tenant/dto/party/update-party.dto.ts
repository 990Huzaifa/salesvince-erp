import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartyClass } from 'src/tenant-db/entities/party.entity';

export class UpdatePartyDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsEnum(PartyClass)
  @IsOptional()
  partyClass?: PartyClass;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  creditLimit?: number;

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
