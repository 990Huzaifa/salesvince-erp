import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { CreateGrnItemDto } from './create-grn-item.dto';

const CREATE_GRN_STATUSES = [GrnStatus.PENDING, GrnStatus.APPROVED] as const;

export class CreateGrnDto {
  @IsUUID()
  purchaseOrderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  grnNumber?: string;

  @IsDateString()
  grnDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Defaults to PENDING. APPROVED runs stock receipt and vendor payable credit on create. */
  @IsOptional()
  @IsIn(CREATE_GRN_STATUSES)
  status?: GrnStatus;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGrnItemDto)
  items?: CreateGrnItemDto[];
}
