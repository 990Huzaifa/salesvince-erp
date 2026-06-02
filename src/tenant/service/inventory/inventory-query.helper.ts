import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import {
  InventoryScope,
  InventoryScopeDto,
} from 'src/tenant/dto/inventory/inventory-scope.dto';

export function assertBusinessId(businessId?: string): string {
  if (!businessId) {
    throw new BadRequestException('Business context is required');
  }
  return businessId;
}

export function resolveInventoryScope(
  dto: InventoryScopeDto,
): { scope: InventoryScope; warehouseId?: string } {
  const scope = dto.scope ?? InventoryScope.ALL;
  const warehouseId = dto.warehouseId?.trim();

  if (scope === InventoryScope.WAREHOUSE && !warehouseId) {
    throw new BadRequestException(
      'warehouseId is required when scope is warehouse',
    );
  }

  if (scope !== InventoryScope.WAREHOUSE && warehouseId) {
    throw new BadRequestException(
      'warehouseId is only allowed when scope is warehouse',
    );
  }

  return { scope, warehouseId };
}

export function assertDateRange(fromDate?: string, toDate?: string): void {
  if (!fromDate || !toDate) {
    return;
  }
  if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
    throw new BadRequestException('fromDate cannot be greater than toDate');
  }
}

export function applyWarehouseFilter<T>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  scope: InventoryScope,
  warehouseId?: string,
): void {
  if (scope === InventoryScope.WAREHOUSE && warehouseId) {
    qb.andWhere(`${alias}.warehouseId = :warehouseId`, { warehouseId });
  }
}

/** Clone for COUNT-only queries; clears GROUP BY / ORDER BY from list queries. */
export function createCountQuery<T>(
  qb: SelectQueryBuilder<T>,
  countExpression: string,
): SelectQueryBuilder<T> {
  const countQb = qb.clone();
  countQb.select(countExpression, 'total');
  countQb.expressionMap.orderBys = {};
  countQb.expressionMap.groupBys = [];
  countQb.offset(undefined);
  countQb.limit(undefined);
  return countQb;
}
