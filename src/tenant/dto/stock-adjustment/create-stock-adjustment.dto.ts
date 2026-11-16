import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockAdjustmentStatus } from 'src/tenant-db/entities/stock-adjustment.entity';
import { CreateStockAdjustmentItemDto } from './create-stock-adjustment-item.dto';

const CREATE_STOCK_ADJUSTMENT_STATUSES = [
  StockAdjustmentStatus.PENDING,
  StockAdjustmentStatus.APPROVED,
] as const;

export class CreateStockAdjustmentDto {
  @IsUUID()
  warehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  adjustmentNumber?: string;

  @IsDateString()
  adjustmentDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Defaults to PENDING. APPROVED posts stock IN/OUT for the warehouse. */
  @IsOptional()
  @IsIn(CREATE_STOCK_ADJUSTMENT_STATUSES)
  status?: StockAdjustmentStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockAdjustmentItemDto)
  items: CreateStockAdjustmentItemDto[];
}
