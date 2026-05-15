import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { RetailerClass, Status } from 'src/tenant-db/entities/retailer.entity';

export class CreateRetailerDto {
  @IsString()
  shopName: string;

  @IsString()
  ownerName: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assetIds?: string[];

  @IsOptional()
  @IsString()
  Phone?: string;

  @IsOptional()
  @IsEmail()
  Email?: string;

  @IsOptional()
  @IsString()
  CNIC?: string;

  @IsOptional()
  @IsString()
  STRN?: string;

  @IsOptional()
  @IsString()
  NTN?: string;

  @IsString()
  Address: string;

  @IsString()
  latitude: string;

  @IsString()
  longitude: string;

  @IsString()
  maxRadius: string;

  @IsString()
  creditLimit: string;

  @IsEnum(RetailerClass)
  class: RetailerClass;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsUUID()
  routeId: string;

  @IsUUID()
  retailerCategoryId: string;

  @IsUUID()
  retailerChannelId: string;

  @IsOptional()
  @IsUUID()
  approvedBy?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalance?: number;
}
