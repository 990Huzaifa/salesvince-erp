import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export enum InventoryScope {
  WAREHOUSE = 'warehouse',
  ALL = 'all',
  AUTO = 'auto',
}

export class InventoryScopeDto {
  @IsOptional()
  @IsEnum(InventoryScope)
  scope: InventoryScope = InventoryScope.ALL;

  @ValidateIf((dto: InventoryScopeDto) => dto.scope === InventoryScope.WAREHOUSE)
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
