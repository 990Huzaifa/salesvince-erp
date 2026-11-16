/** Line type for sale order / delivery note / invoice / return items. */
export enum SaleItemType {
  PRODUCT = 'PRODUCT',
  SERVICE = 'SERVICE',
}

/** Postgres enum name shared by every sale item table. */
export const SALE_ITEM_TYPE_ENUM_NAME = 'sale_item_type_enum';

/** Legacy rows without itemType are treated as PRODUCT. */
export function isProductSaleItem(item: {
  itemType?: SaleItemType | null;
}): boolean {
  return !item.itemType || item.itemType === SaleItemType.PRODUCT;
}

export function isServiceSaleItem(item: {
  itemType?: SaleItemType | null;
}): boolean {
  return item.itemType === SaleItemType.SERVICE;
}
