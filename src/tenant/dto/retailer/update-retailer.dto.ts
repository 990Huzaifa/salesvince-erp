import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RetailerClass, Status } from 'src/tenant-db/entities/retailer.entity';

export class UpdateRetailerDto {
  @IsOptional()
  @IsString()
  shopName?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

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

  @IsOptional()
  @IsString()
  Address?: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsString()
  maxRadius?: string;

  @IsOptional()
  @IsString()
  creditLimit?: string;

  @IsOptional()
  @IsEnum(RetailerClass)
  class?: RetailerClass;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  retailerCategoryId?: string;

  @IsOptional()
  @IsUUID()
  retailerChannelId?: string;

  @IsOptional()
  @IsUUID()
  approvedBy?: string;
}
