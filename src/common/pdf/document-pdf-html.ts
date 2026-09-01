import {
  formatDocumentDate,
  formatPakistaniNumber,
  formatPrintedAt,
  prettifyValue,
} from './pdf-formatters';
import { escapeHtml } from './pdf-html';

export type BusinessPdfContext = {
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  currency: string;
};

type PdfPageOptions = {
  title: string;
  documentNumber: string;
  documentDate: string;
  business: BusinessPdfContext;
  logoDataUri?: string | null;
  metaRows?: Array<{ label: string; value: string }>;
  partySection?: { heading: string; lines: string[] };
  bodyHtml: string;
  totalsHtml: string;
  balanceHtml?: string;
  notes?: string | null;
};

const baseStyles = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    line-height: 1.4;
  }
  .pdf-content { width: 100%; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 2px solid #222;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .logo { max-height: 56px; max-width: 160px; object-fit: contain; }
  .business-name { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
  .muted { color: #555; }
  .doc-title {
    font-size: 20px;
    font-weight: 700;
    text-align: right;
    margin: 0 0 8px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    font-size: 11px;
    text-align: right;
  }
  .meta-label { color: #555; font-weight: 600; }
  .party-box {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 10px 12px;
    margin-bottom: 16px;
    background: #fafafa;
  }
  .party-heading {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #666;
    margin: 0 0 6px;
  }
  .party-line { margin: 0 0 2px; }
  table.items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  table.items th {
    background: #f0f0f0;
    border: 1px solid #ccc;
    padding: 6px 5px;
    font-size: 10px;
    text-align: left;
  }
  table.items td {
    border: 1px solid #ddd;
    padding: 5px;
    vertical-align: top;
  }
  table.items .num { text-align: right; white-space: nowrap; }
  table.items .center { text-align: center; }
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }
  .totals {
    min-width: 260px;
    margin-left: auto;
  }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td {
    padding: 4px 8px;
    border-bottom: 1px solid #eee;
  }
  .totals .label { color: #555; }
  .totals .value { text-align: right; font-weight: 600; }
  .totals .grand td {
    border-top: 2px solid #222;
    border-bottom: none;
    font-size: 13px;
    font-weight: 700;
    padding-top: 8px;
  }
  .balance-box {
    margin-top: 12px;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #f9f9f9;
    font-size: 11px;
  }
  .notes {
    margin-top: 16px;
    padding: 10px 12px;
    border-left: 3px solid #ccc;
    background: #fafafa;
  }
  .printed-at {
    margin-top: 24px;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    font-size: 9px;
    color: #777;
    text-align: center;
  }
`;

const formatAmount = (value: unknown, currency: string): string =>
  `${escapeHtml(currency)} ${escapeHtml(formatPakistaniNumber(value))}`;

const formatPartyLines = (party: {
  name?: string | null;
  code?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  cityName?: string | null;
  stateName?: string | null;
  countryName?: string | null;
} | null): string[] => {
  if (!party) {
    return ['-'];
  }

  const location = [party.cityName, party.stateName, party.countryName]
    .filter(Boolean)
    .join(', ');

  return [
    party.name ? `${party.name}${party.code ? ` (${party.code})` : ''}` : '-',
    party.address || '',
    location,
    party.phone ? `Phone: ${party.phone}` : '',
    party.email ? `Email: ${party.email}` : '',
  ].filter(Boolean);
};

const wrapDocumentPdfHtml = (options: PdfPageOptions): string => {
  const businessName = options.business.legalName || options.business.name;
  const logoHtml = options.logoDataUri
    ? `<img class="logo" src="${options.logoDataUri}" alt="Logo" />`
    : '';

  const metaRows = [
    { label: 'Document #', value: options.documentNumber },
    { label: 'Date', value: options.documentDate },
    ...(options.metaRows ?? []),
  ]
    .map(
      (row) =>
        `<div class="meta-label">${escapeHtml(row.label)}</div><div>${escapeHtml(row.value)}</div>`,
    )
    .join('');

  const partyHtml = options.partySection
    ? `<div class="party-box">
        <p class="party-heading">${escapeHtml(options.partySection.heading)}</p>
        ${options.partySection.lines
          .map((line) => `<p class="party-line">${escapeHtml(line)}</p>`)
          .join('')}
      </div>`
    : '';

  const notesHtml = options.notes?.trim()
    ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(options.notes.trim())}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(options.title)} - ${escapeHtml(options.documentNumber)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="pdf-content">
    <header class="header">
      <div>
        ${logoHtml}
        <h1 class="business-name">${escapeHtml(businessName)}</h1>
        ${options.business.address ? `<div class="muted">${escapeHtml(options.business.address)}</div>` : ''}
        ${options.business.phone ? `<div class="muted">${escapeHtml(options.business.phone)}</div>` : ''}
      </div>
      <div>
        <h2 class="doc-title">${escapeHtml(options.title)}</h2>
        <div class="meta-grid">${metaRows}</div>
      </div>
    </header>
    ${partyHtml}
    ${options.bodyHtml}
    <div class="footer-row">
      <div></div>
      <div class="totals">${options.totalsHtml}</div>
    </div>
    ${options.balanceHtml ?? ''}
    ${notesHtml}
    <div class="printed-at">Printed on ${escapeHtml(formatPrintedAt())}</div>
  </div>
</body>
</html>`;
};

const buildTotalsTable = (
  rows: Array<{ label: string; value: string; grand?: boolean }>,
): string => {
  const body = rows
    .map(
      (row) =>
        `<tr class="${row.grand ? 'grand' : ''}">
          <td class="label">${escapeHtml(row.label)}</td>
          <td class="value">${row.value}</td>
        </tr>`,
    )
    .join('');

  return `<table>${body}</table>`;
};

const buildBalanceHtml = (
  label: string,
  previousBalance: number | null | undefined,
  currentBalance: number | null | undefined,
  currency: string,
): string | undefined => {
  if (previousBalance == null && currentBalance == null) {
    return undefined;
  }

  return `<div class="balance-box">
    <strong>${escapeHtml(label)}</strong><br />
    Previous Balance: ${formatAmount(previousBalance ?? 0, currency)}<br />
    Current Balance: ${formatAmount(currentBalance ?? 0, currency)}
  </div>`;
};

export const buildSaleOrderPdfHtml = (
  order: {
    orderNumber: string;
    orderDate: string | Date;
    orderStatus: string;
    notes?: string | null;
    orderTotal: number;
    deliveryCost: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    customer?: {
      name?: string | null;
      code?: string | null;
    } | null;
    items: Array<{
      product?: { name?: string | null; skuCode?: string | null } | null;
      productFlavour?: {
        flavour?: { name?: string | null } | null;
      } | null;
      uom?: { name?: string | null } | null;
      warehouse?: { name?: string | null } | null;
      quantity: number;
      saleUnitPrice: number;
      discountAmount: number;
      totalAmount: number;
    }>;
  },
  business: BusinessPdfContext,
  logoDataUri?: string | null,
): string => {
  const currency = business.currency || 'PKR';
  const itemRows = order.items
    .map(
      (item, index) => `<tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.product?.name ?? '-')}</td>
        <td>${escapeHtml(item.product?.skuCode ?? '-')}</td>
        <td>${escapeHtml(item.productFlavour?.flavour?.name ?? '-')}</td>
        <td>${escapeHtml(item.uom?.name ?? '-')}</td>
        <td>${escapeHtml(item.warehouse?.name ?? '-')}</td>
        <td class="num">${escapeHtml(formatPakistaniNumber(item.quantity, 0))}</td>
        <td class="num">${formatAmount(item.saleUnitPrice, currency)}</td>
        <td class="num">${formatAmount(item.discountAmount, currency)}</td>
        <td class="num">${formatAmount(item.totalAmount, currency)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `<table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>SKU</th>
        <th>Flavour</th>
        <th>UOM</th>
        <th>Warehouse</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Discount</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="10">No items</td></tr>'}</tbody>
  </table>`;

  const totalsHtml = buildTotalsTable([
    { label: 'Order Total', value: formatAmount(order.orderTotal, currency) },
    { label: 'Delivery Cost', value: formatAmount(order.deliveryCost, currency) },
    { label: 'Tax', value: formatAmount(order.taxAmount, currency) },
    { label: 'Discount', value: formatAmount(order.discountAmount, currency) },
    {
      label: 'Grand Total',
      value: formatAmount(order.totalAmount, currency),
      grand: true,
    },
  ]);

  return wrapDocumentPdfHtml({
    title: 'Sale Order',
    documentNumber: order.orderNumber,
    documentDate: formatDocumentDate(order.orderDate),
    business,
    logoDataUri,
    metaRows: [{ label: 'Status', value: prettifyValue(order.orderStatus) }],
    partySection: {
      heading: 'Customer',
      lines: order.customer
        ? [
            `${order.customer.name ?? '-'}${order.customer.code ? ` (${order.customer.code})` : ''}`,
          ]
        : ['-'],
    },
    bodyHtml,
    totalsHtml,
    notes: order.notes,
  });
};

export const buildSaleInvoicePdfHtml = (
  invoice: {
    invoiceNumber: string;
    invoiceDate: string | Date;
    deliveryCost: number;
    totalTaxAmount: number;
    totalDiscountAmount: number;
    totalAmount: number;
    saleOrder?: { orderNumber?: string | null } | null;
    deliveryNote?: { deliveryNoteNumber?: string | null } | null;
    customer?: {
      name?: string | null;
      code?: string | null;
      address?: string | null;
      email?: string | null;
      phone?: string | null;
      cityName?: string | null;
      stateName?: string | null;
      countryName?: string | null;
      previousBalance?: number | null;
      currentBalance?: number | null;
    } | null;
    items: Array<{
      product?: { name?: string | null; skuCode?: string | null } | null;
      productFlavour?: {
        flavour?: { name?: string | null } | null;
      } | null;
      uom?: { name?: string | null } | null;
      warehouse?: { name?: string | null } | null;
      quantity: number;
      saleUnitPrice: number;
      discountPercentage: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    }>;
  },
  business: BusinessPdfContext,
  logoDataUri?: string | null,
): string => {
  const currency = business.currency || 'PKR';
  const itemRows = invoice.items
    .map(
      (item, index) => `<tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.product?.name ?? '-')}</td>
        <td>${escapeHtml(item.product?.skuCode ?? '-')}</td>
        <td>${escapeHtml(item.productFlavour?.flavour?.name ?? '-')}</td>
        <td>${escapeHtml(item.uom?.name ?? '-')}</td>
        <td>${escapeHtml(item.warehouse?.name ?? '-')}</td>
        <td class="num">${escapeHtml(formatPakistaniNumber(item.quantity, 0))}</td>
        <td class="num">${formatAmount(item.saleUnitPrice, currency)}</td>
        <td class="num">${escapeHtml(formatPakistaniNumber(item.discountPercentage))}%</td>
        <td class="num">${formatAmount(item.discountAmount, currency)}</td>
        <td class="num">${formatAmount(item.taxAmount, currency)}</td>
        <td class="num">${formatAmount(item.totalAmount, currency)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `<table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>SKU</th>
        <th>Flavour</th>
        <th>UOM</th>
        <th>Warehouse</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Disc %</th>
        <th class="num">Discount</th>
        <th class="num">Tax</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="12">No items</td></tr>'}</tbody>
  </table>`;

  const metaRows: Array<{ label: string; value: string }> = [];
  if (invoice.saleOrder?.orderNumber) {
    metaRows.push({ label: 'Sale Order', value: invoice.saleOrder.orderNumber });
  }
  if (invoice.deliveryNote?.deliveryNoteNumber) {
    metaRows.push({
      label: 'Delivery Note',
      value: invoice.deliveryNote.deliveryNoteNumber,
    });
  }

  const totalsHtml = buildTotalsTable([
    { label: 'Delivery Cost', value: formatAmount(invoice.deliveryCost, currency) },
    { label: 'Total Tax', value: formatAmount(invoice.totalTaxAmount, currency) },
    {
      label: 'Total Discount',
      value: formatAmount(invoice.totalDiscountAmount, currency),
    },
    {
      label: 'Grand Total',
      value: formatAmount(invoice.totalAmount, currency),
      grand: true,
    },
  ]);

  const balanceHtml = buildBalanceHtml(
    'Customer Balance',
    invoice.customer?.previousBalance,
    invoice.customer?.currentBalance,
    currency,
  );

  return wrapDocumentPdfHtml({
    title: 'Sale Invoice',
    documentNumber: invoice.invoiceNumber,
    documentDate: formatDocumentDate(invoice.invoiceDate),
    business,
    logoDataUri,
    metaRows,
    partySection: {
      heading: 'Bill To',
      lines: formatPartyLines(invoice.customer ?? null),
    },
    bodyHtml,
    totalsHtml,
    balanceHtml,
  });
};

export const buildPurchaseInvoicePdfHtml = (
  invoice: {
    invoiceNumber: string;
    invoiceDate: string | Date;
    totalTaxAmount: number;
    totalDiscountAmount: number;
    totalAmount: number;
    purchaseOrder?: { orderNumber?: string | null } | null;
    grn?: { grnNumber?: string | null } | null;
    vendor?: {
      name?: string | null;
      code?: string | null;
      address?: string | null;
      email?: string | null;
      phone?: string | null;
      cityName?: string | null;
      stateName?: string | null;
      countryName?: string | null;
      previousBalance?: number | null;
      currentBalance?: number | null;
    } | null;
    items: Array<{
      product?: { name?: string | null; skuCode?: string | null } | null;
      productFlavour?: {
        flavour?: { name?: string | null } | null;
      } | null;
      uom?: { name?: string | null } | null;
      quantity: number;
      purchaseUnitPrice: number;
      discountPercentage: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    }>;
  },
  business: BusinessPdfContext,
  logoDataUri?: string | null,
): string => {
  const currency = business.currency || 'PKR';
  const itemRows = invoice.items
    .map(
      (item, index) => `<tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.product?.name ?? '-')}</td>
        <td>${escapeHtml(item.product?.skuCode ?? '-')}</td>
        <td>${escapeHtml(item.productFlavour?.flavour?.name ?? '-')}</td>
        <td>${escapeHtml(item.uom?.name ?? '-')}</td>
        <td class="num">${escapeHtml(formatPakistaniNumber(item.quantity, 0))}</td>
        <td class="num">${formatAmount(item.purchaseUnitPrice, currency)}</td>
        <td class="num">${escapeHtml(formatPakistaniNumber(item.discountPercentage))}%</td>
        <td class="num">${formatAmount(item.discountAmount, currency)}</td>
        <td class="num">${formatAmount(item.taxAmount, currency)}</td>
        <td class="num">${formatAmount(item.totalAmount, currency)}</td>
      </tr>`,
    )
    .join('');

  const bodyHtml = `<table class="items">
    <thead>
      <tr>
        <th>#</th>
        <th>Product</th>
        <th>SKU</th>
        <th>Flavour</th>
        <th>UOM</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Disc %</th>
        <th class="num">Discount</th>
        <th class="num">Tax</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="11">No items</td></tr>'}</tbody>
  </table>`;

  const metaRows: Array<{ label: string; value: string }> = [];
  if (invoice.purchaseOrder?.orderNumber) {
    metaRows.push({
      label: 'Purchase Order',
      value: invoice.purchaseOrder.orderNumber,
    });
  }
  if (invoice.grn?.grnNumber) {
    metaRows.push({ label: 'GRN', value: invoice.grn.grnNumber });
  }

  const totalsHtml = buildTotalsTable([
    { label: 'Total Tax', value: formatAmount(invoice.totalTaxAmount, currency) },
    {
      label: 'Total Discount',
      value: formatAmount(invoice.totalDiscountAmount, currency),
    },
    {
      label: 'Grand Total',
      value: formatAmount(invoice.totalAmount, currency),
      grand: true,
    },
  ]);

  const balanceHtml = buildBalanceHtml(
    'Vendor Balance',
    invoice.vendor?.previousBalance,
    invoice.vendor?.currentBalance,
    currency,
  );

  return wrapDocumentPdfHtml({
    title: 'Purchase Invoice',
    documentNumber: invoice.invoiceNumber,
    documentDate: formatDocumentDate(invoice.invoiceDate),
    business,
    logoDataUri,
    metaRows,
    partySection: {
      heading: 'Vendor',
      lines: formatPartyLines(invoice.vendor ?? null),
    },
    bodyHtml,
    totalsHtml,
    balanceHtml,
  });
};
