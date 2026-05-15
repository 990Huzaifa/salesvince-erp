import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartyType } from 'src/tenant-db/entities/party.entity';

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
}
