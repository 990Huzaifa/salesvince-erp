export type WarehouseSlipItemDto = {
  productName: string;
  skuCode?: string;
  barcode?: string;
  flavour?: string;
  uom: string;
  quantity: number;
};

export type WarehouseSlipDto = {
  documentTypeLabel: string;
  documentNumber: string;
  documentDate: string | Date;
  partyLabel?: string;
  partyName?: string;
  partyCode?: string;
  warehouseLabel?: string;
  fromWarehouse?: string;
  toWarehouse?: string;
  notes?: string | null;
  totalQuantity: number;
  items: WarehouseSlipItemDto[];
};

export type WarehouseSlipCompanyContext = {
  name: string;
  phone?: string | null;
  address?: string | null;
};
