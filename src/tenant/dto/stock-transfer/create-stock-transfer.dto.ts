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
import { StockTransferStatus } from 'src/tenant-db/entities/stock-transfer.entity';
import { CreateStockTransferItemDto } from './create-stock-transfer-item.dto';

const CREATE_STOCK_TRANSFER_STATUSES = [
  StockTransferStatus.PENDING,
  StockTransferStatus.APPROVED,
] as const;

export class CreateStockTransferDto {
  @IsUUID()
  fromWarehouseId: string;

  @IsUUID()
  toWarehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  transferNumber?: string;

  @IsDateString()
  transferDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Defaults to PENDING. APPROVED posts stock OUT from source and IN to destination. */
  @IsOptional()
  @IsIn(CREATE_STOCK_TRANSFER_STATUSES)
  status?: StockTransferStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferItemDto)
  items: CreateStockTransferItemDto[];
}
