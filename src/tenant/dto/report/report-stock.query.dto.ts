import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { InventoryScope } from '../inventory/inventory-scope.dto';
import { ReportDateRangeQueryDto } from './report-date-range.query.dto';

export class ReportStockSummaryQueryDto extends ReportDateRangeQueryDto {
  @IsOptional()
  @IsEnum(InventoryScope)
  scope?: InventoryScope = InventoryScope.ALL;

  @ValidateIf((dto: ReportStockSummaryQueryDto) => dto.scope === InventoryScope.WAREHOUSE)
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  uomId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ReportStockMovementQueryDto extends ReportStockSummaryQueryDto {
  @IsOptional()
  @IsString()
  movementType?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;
}

export class ReportStockValuationQueryDto {
  @IsOptional()
  @IsEnum(InventoryScope)
  scope?: InventoryScope = InventoryScope.ALL;

  @ValidateIf((dto: ReportStockValuationQueryDto) => dto.scope === InventoryScope.WAREHOUSE)
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  search?: string;
}
