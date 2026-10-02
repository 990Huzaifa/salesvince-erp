import { Between, DataSource, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  SaleReturn,
  SaleReturnStatus,
} from 'src/tenant-db/entities/sale-return.entity';
import {
  PurchaseReturn,
  PurchaseReturnStatus,
} from 'src/tenant-db/entities/purchase-return.entity';
import { endOfDay, roundAmount, startOfDay } from './report-query.helper';

export type MatchedReturnLine = {
  returnId: string;
  returnDate: Date;
  partyId: string;
  cityId: string | null;
  productId: string;
  productName: string;
  skuCode: string | null;
  uomId: string;
  uomName: string | null;
  productFlavourId: string | null;
  flavourName: string | null;
  quantity: number;
  grossAmount: number;
  taxAmount: number;
  discountAmount: number;
  /** Cost side for sale returns (purchase unit × qty). Purchase returns use line cost. */
  costAmount: number;
};

export type ReturnAmountTotals = {
  grossAmount: number;
  taxAmount: number;
  discountAmount: number;
  costAmount: number;
  quantity: number;
  documentCount: number;
};

type ReturnDateFilters = {
  startDate?: Date;
  endDate?: Date;
  partyId?: string;
  cityId?: string;
};

function matchesInvoiceItem(
  invoiceItem: {
    productId: string;
    uomId: string;
    productFlavourId?: string | null;
  },
  returnItem: {
    productId: string;
    uomId: string;
    productFlavourId?: string | null;
  },
): boolean {
  return (
    invoiceItem.productId === returnItem.productId &&
    invoiceItem.uomId === returnItem.uomId &&
    (invoiceItem.productFlavourId ?? null) ===
      (returnItem.productFlavourId ?? null)
  );
}

function prorate(
  invoiceQty: number,
  returnQty: number,
  amount: number,
): number {
  if (invoiceQty <= 0 || returnQty <= 0) {
    return 0;
  }
  return roundAmount((amount / invoiceQty) * returnQty);
}

export function sumReturnLines(
  lines: MatchedReturnLine[],
): Omit<ReturnAmountTotals, 'documentCount'> {
  return {
    grossAmount: roundAmount(
      lines.reduce((sum, line) => sum + line.grossAmount, 0),
    ),
    taxAmount: roundAmount(
      lines.reduce((sum, line) => sum + line.taxAmount, 0),
    ),
    discountAmount: roundAmount(
      lines.reduce((sum, line) => sum + line.discountAmount, 0),
    ),
    costAmount: roundAmount(
      lines.reduce((sum, line) => sum + line.costAmount, 0),
    ),
    quantity: roundAmount(
      lines.reduce((sum, line) => sum + line.quantity, 0),
    ),
  };
}

function passesPartyCityFilter(
  partyId: string | null | undefined,
  cityId: string | null | undefined,
  filters: ReturnDateFilters,
): boolean {
  if (filters.partyId && partyId !== filters.partyId) {
    return false;
  }
  if (filters.cityId && (cityId ?? null) !== filters.cityId) {
    return false;
  }
  return true;
}

function buildReturnDateWhere(
  filters: ReturnDateFilters,
): FindOptionsWhere<SaleReturn>['returnDate'] | undefined {
  if (filters.startDate && filters.endDate) {
    return Between(startOfDay(filters.startDate), endOfDay(filters.endDate));
  }
  if (filters.startDate) {
    return MoreThanOrEqual(startOfDay(filters.startDate));
  }
  if (filters.endDate) {
    return LessThanOrEqual(endOfDay(filters.endDate));
  }
  return undefined;
}

/**
 * Approved sale returns in range, amounts prorated from original sale invoice lines.
 */
export async function loadApprovedSaleReturnLines(
  tenantDb: DataSource,
  businessId: string,
  filters: ReturnDateFilters = {},
): Promise<MatchedReturnLine[]> {
  const where: FindOptionsWhere<SaleReturn> = {
    businessId,
    status: SaleReturnStatus.APPROVED,
  };
  const returnDate = buildReturnDateWhere(filters);
  if (returnDate) {
    where.returnDate = returnDate;
  }

  const returns = await tenantDb.getRepository(SaleReturn).find({
    where,
    relations: {
      saleReturnItems: { product: true, uom: true, productFlavour: { flavour: true } },
      saleInvoice: {
        customer: true,
        items: true,
        saleOrder: { items: true },
      },
    },
  });

  const lines: MatchedReturnLine[] = [];

  for (const saleReturn of returns) {
    const customer = saleReturn.saleInvoice?.customer;
    const partyId = customer?.id ?? saleReturn.saleInvoice?.customerId;
    const cityId = customer?.cityId ?? null;
    if (!passesPartyCityFilter(partyId, cityId, filters)) {
      continue;
    }

    const orderItems = saleReturn.saleInvoice?.saleOrder?.items ?? [];

    for (const returnItem of saleReturn.saleReturnItems ?? []) {
      const invoiceItem = saleReturn.saleInvoice?.items?.find((item) =>
        matchesInvoiceItem(item, returnItem),
      );
      if (!invoiceItem || Number(invoiceItem.quantity) <= 0) {
        continue;
      }

      const returnQty = Number(returnItem.quantity ?? 0);
      const invoiceQty = Number(invoiceItem.quantity);
      const orderItem = orderItems.find((item) =>
        matchesInvoiceItem(item, returnItem),
      );
      const purchaseUnitPrice = Number(orderItem?.purchaseUnitPrice ?? 0);

      lines.push({
        returnId: saleReturn.id,
        returnDate: saleReturn.returnDate,
        partyId: partyId ?? '',
        cityId,
        productId: returnItem.productId,
        productName: returnItem.product?.name ?? '',
        skuCode: returnItem.product?.skuCode ?? null,
        uomId: returnItem.uomId,
        uomName: returnItem.uom?.name ?? null,
        productFlavourId: returnItem.productFlavourId ?? null,
        flavourName: returnItem.productFlavour?.flavour?.name ?? null,
        quantity: returnQty,
        grossAmount: prorate(
          invoiceQty,
          returnQty,
          Number(invoiceItem.totalAmount ?? 0),
        ),
        taxAmount: prorate(
          invoiceQty,
          returnQty,
          Number(invoiceItem.taxAmount ?? 0),
        ),
        discountAmount: prorate(
          invoiceQty,
          returnQty,
          Number(invoiceItem.discountAmount ?? 0),
        ),
        costAmount: roundAmount(purchaseUnitPrice * returnQty),
      });
    }
  }

  return lines;
}

/**
 * Approved purchase returns in range, amounts prorated from original purchase invoice lines.
 */
export async function loadApprovedPurchaseReturnLines(
  tenantDb: DataSource,
  businessId: string,
  filters: ReturnDateFilters = {},
): Promise<MatchedReturnLine[]> {
  const where: FindOptionsWhere<PurchaseReturn> = {
    businessId,
    status: PurchaseReturnStatus.APPROVED,
  };
  const returnDate = buildReturnDateWhere(filters);
  if (returnDate) {
    where.returnDate = returnDate;
  }

  const returns = await tenantDb.getRepository(PurchaseReturn).find({
    where,
    relations: {
      purchaseReturnItems: {
        product: true,
        uom: true,
        productFlavour: { flavour: true },
      },
      purchaseInvoice: { vendor: true, items: true },
    },
  });

  const lines: MatchedReturnLine[] = [];

  for (const purchaseReturn of returns) {
    const vendor = purchaseReturn.purchaseInvoice?.vendor;
    const partyId = vendor?.id ?? purchaseReturn.purchaseInvoice?.vendorId;
    const cityId = vendor?.cityId ?? null;
    if (!passesPartyCityFilter(partyId, cityId, filters)) {
      continue;
    }

    for (const returnItem of purchaseReturn.purchaseReturnItems ?? []) {
      const invoiceItem = purchaseReturn.purchaseInvoice?.items?.find((item) =>
        matchesInvoiceItem(item, returnItem),
      );
      if (!invoiceItem || Number(invoiceItem.quantity) <= 0) {
        continue;
      }

      const returnQty = Number(returnItem.quantity ?? 0);
      const invoiceQty = Number(invoiceItem.quantity);
      const purchaseUnitPrice = Number(invoiceItem.purchaseUnitPrice ?? 0);

      lines.push({
        returnId: purchaseReturn.id,
        returnDate: purchaseReturn.returnDate,
        partyId: partyId ?? '',
        cityId,
        productId: returnItem.productId,
        productName: returnItem.product?.name ?? '',
        skuCode: returnItem.product?.skuCode ?? null,
        uomId: returnItem.uomId,
        uomName: returnItem.uom?.name ?? null,
        productFlavourId: returnItem.productFlavourId ?? null,
        flavourName: returnItem.productFlavour?.flavour?.name ?? null,
        quantity: returnQty,
        grossAmount: prorate(
          invoiceQty,
          returnQty,
          Number(invoiceItem.totalAmount ?? 0),
        ),
        taxAmount: prorate(
          invoiceQty,
          returnQty,
          Number(invoiceItem.taxAmount ?? 0),
        ),
        discountAmount: prorate(
          invoiceQty,
          returnQty,
          Number(invoiceItem.discountAmount ?? 0),
        ),
        costAmount: roundAmount(purchaseUnitPrice * returnQty),
      });
    }
  }

  return lines;
}

function documentCountFromLines(lines: MatchedReturnLine[]): number {
  return new Set(lines.map((line) => line.returnId)).size;
}

export async function aggregateApprovedSaleReturns(
  tenantDb: DataSource,
  businessId: string,
  filters: ReturnDateFilters = {},
): Promise<ReturnAmountTotals> {
  const lines = await loadApprovedSaleReturnLines(
    tenantDb,
    businessId,
    filters,
  );

  return {
    ...sumReturnLines(lines),
    documentCount: documentCountFromLines(lines),
  };
}

export async function aggregateApprovedPurchaseReturns(
  tenantDb: DataSource,
  businessId: string,
  filters: ReturnDateFilters = {},
): Promise<ReturnAmountTotals> {
  const lines = await loadApprovedPurchaseReturnLines(
    tenantDb,
    businessId,
    filters,
  );

  return {
    ...sumReturnLines(lines),
    documentCount: documentCountFromLines(lines),
  };
}
