import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  ReferenceType,
  StockMovementType,
} from 'src/tenant-db/entities/stock.entity';
import { InventoryScopeDto } from './inventory-scope.dto';

export class GetStockMovementDto extends InventoryScopeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @IsOptional()
  @IsEnum(ReferenceType)
  referenceType?: ReferenceType;
}
