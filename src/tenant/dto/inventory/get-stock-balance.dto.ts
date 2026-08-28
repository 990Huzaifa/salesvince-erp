import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { InventoryScopeDto } from './inventory-scope.dto';

export class GetStockBalanceDto extends InventoryScopeDto {
  /** Vendor party id used to filter stock purchased from a specific vendor. */
  @IsOptional()
  @IsUUID()
  partyId?: string;

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
}
