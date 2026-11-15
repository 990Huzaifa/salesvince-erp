import { ForbiddenException } from '@nestjs/common';
import { SaleReturnMode } from 'src/tenant-db/entities/sale-return.entity';
import { PurchaseReturnMode } from 'src/tenant-db/entities/purchase-return.entity';

export const SALE_RETURN_CREATE_PERMISSIONS = [
  'CREATE_SALE_RETURN',
  'CREATE_SALE_RETURN_BY_INVOICE',
  'CREATE_SALE_RETURN_BY_CUSTOMER',
] as const;

export const PURCHASE_RETURN_CREATE_PERMISSIONS = [
  'CREATE_PURCHASE_RETURN',
  'CREATE_PURCHASE_RETURN_BY_INVOICE',
  'CREATE_PURCHASE_RETURN_BY_SUPPLIER',
] as const;

function normalizeKeys(keys: string[] | undefined): Set<string> {
  return new Set((keys ?? []).map((k) => k.toUpperCase()));
}

export function assertSaleReturnCreateModePermission(
  returnMode: SaleReturnMode,
  permissionKeys: string[] | undefined,
  isSuperAdmin?: boolean,
): void {
  if (isSuperAdmin) {
    return;
  }
  const keys = normalizeKeys(permissionKeys);
  if (keys.has('CREATE_SALE_RETURN')) {
    return;
  }
  if (returnMode === SaleReturnMode.INVOICE) {
    if (!keys.has('CREATE_SALE_RETURN_BY_INVOICE')) {
      throw new ForbiddenException(
        'Missing required permission: CREATE_SALE_RETURN_BY_INVOICE',
      );
    }
    return;
  }
  if (!keys.has('CREATE_SALE_RETURN_BY_CUSTOMER')) {
    throw new ForbiddenException(
      'Missing required permission: CREATE_SALE_RETURN_BY_CUSTOMER',
    );
  }
}

export function assertPurchaseReturnCreateModePermission(
  returnMode: PurchaseReturnMode,
  permissionKeys: string[] | undefined,
  isSuperAdmin?: boolean,
): void {
  if (isSuperAdmin) {
    return;
  }
  const keys = normalizeKeys(permissionKeys);
  if (keys.has('CREATE_PURCHASE_RETURN')) {
    return;
  }
  if (returnMode === PurchaseReturnMode.INVOICE) {
    if (!keys.has('CREATE_PURCHASE_RETURN_BY_INVOICE')) {
      throw new ForbiddenException(
        'Missing required permission: CREATE_PURCHASE_RETURN_BY_INVOICE',
      );
    }
    return;
  }
  if (!keys.has('CREATE_PURCHASE_RETURN_BY_SUPPLIER')) {
    throw new ForbiddenException(
      'Missing required permission: CREATE_PURCHASE_RETURN_BY_SUPPLIER',
    );
  }
}
