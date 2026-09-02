import {
  formatDocumentDate,
  formatPakistaniNumber,
  formatPrintedAt,
} from 'src/common/pdf';
import { escapeHtml } from 'src/common/pdf';
import type { BusinessPdfContext } from 'src/common/pdf';

const MAX_ROWS = 15;

type SaleInvoicePdfItem = {
  product?: { name?: string | null } | null;
  uom?: { name?: string | null } | null;
  quantity: number;
  saleUnitPrice: number;
  discountAmount: number;
  totalAmount: number;
};

type SaleInvoicePdfDocument = {
  invoiceNumber: string;
  invoiceDate: string | Date;
  saleOrder?: { orderNumber?: string | null } | null;
  customer?: {
    code?: string | null;
    name?: string | null;
    address?: string | null;
    cityName?: string | null;
    previousBalance?: number | null;
    currentBalance?: number | null;
  } | null;
  customerBalance?: {
    previousBalance?: number | null;
    currentBalance?: number | null;
  } | null;
  totalDiscountAmount: number;
  totalAmount: number;
  deliveryCost: number;
  items: SaleInvoicePdfItem[];
};

const valueOrEmpty = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
};

const money = (value: unknown): string =>
  escapeHtml(formatPakistaniNumber(value));

const renderInfoRow = (label: string, value: unknown): string => `
  <div class="info-row">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(valueOrEmpty(value))}</span>
  </div>`;

const renderItemRow = (item: SaleInvoicePdfItem, index: number): string => `
  <tr class="item-row ${index % 2 === 0 ? 'row-a' : 'row-b'}">
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(valueOrEmpty(item.product?.name))}</td>
    <td class="center">${escapeHtml(valueOrEmpty(item.uom?.name))}</td>
    <td class="center">${escapeHtml(formatPakistaniNumber(item.quantity, 0))}</td>
    <td class="number">${money(item.saleUnitPrice)}</td>
    <td class="number">${money(item.discountAmount)}</td>
    <td class="number">${money(item.totalAmount)}</td>
  </tr>`;

const renderEmptyRow = (index: number): string => `
  <tr class="item-row empty-row ${index % 2 === 0 ? 'row-a' : 'row-b'}">
    <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
  </tr>`;

export const buildSaleInvoicePdfHtml = (
  invoice: SaleInvoicePdfDocument,
  business: BusinessPdfContext,
  logoDataUri?: string | null,
  showBalanceDetails = true,
  printedAt: Date = new Date(),
  options: {
    documentTitle?: string;
    documentNumberLabel?: string;
    orderNumber?: string | null;
    watermarkText?: string;
  } = {},
): string => {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rows = items.map(renderItemRow);
  for (let index = items.length; index < MAX_ROWS; index += 1) {
    rows.push(renderEmptyRow(index));
  }

  const businessName = business.name || 'ESP';
  const businessAddress = business.address || 'Shahrah e faisal Karachi';
  const initials =
    businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'EP';
  const customer = invoice.customer || {};
  const balance = invoice.customerBalance || {};
  const subTotal = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.saleUnitPrice || 0),
    0,
  );
  const overallQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const previousBalance = Number(
    balance.previousBalance ?? customer.previousBalance ?? 0,
  );
  const currentBalance = Number(
    balance.currentBalance ?? customer.currentBalance ?? 0,
  );
  const documentTitle = options.documentTitle || 'Invoice';
  const documentNumberLabel = options.documentNumberLabel || 'Invoice No.';
  const orderNumber = options.orderNumber ?? invoice.saleOrder?.orderNumber;
  const watermarkText = options.watermarkText || '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sale Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    :root { --primary:#2d5f3e; --primary-text:#fff; --foreground:#17182a; --muted:#667085; --border:#cfd8d4; --row-a:#edf3ef; --row-b:#f6f8f7; --surface-muted:#f7f8fb; }
    @page { size:A4 portrait; margin:10mm; }
    * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    html, body { margin:0; padding:0; background:#fff; font-family:Arial,sans-serif; color:#000; }
    body { width:190mm; }
    .pdf-content { width:190mm; min-height:0; margin:0 auto; padding:0; position:relative; } .watermark { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-32deg); color:rgba(45,95,62,.11); font-size:82px; font-weight:800; letter-spacing:8px; line-height:1; white-space:nowrap; pointer-events:none; user-select:none; z-index:0; }
    .document-header { border-bottom:3px solid var(--primary); padding-bottom:10px; margin-bottom:14px; }
    .document-header-main { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; }
    .document-heading { flex:1; } h1 { margin:0; color:var(--foreground); font-size:68px; line-height:.9; font-weight:300; }
    .document-meta { margin-top:10px; font-size:12px; line-height:1.5; }
    .company { min-width:130px; text-align:center; } .logo-box { width:76px; height:76px; margin:0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .logo-box img { width:100%; height:100%; object-fit:contain; } .logo-fallback { color:var(--primary); font-size:44px; line-height:1; font-weight:700; }
    .company-name { margin-top:4px; color:var(--foreground); font-size:13px; line-height:1.2; font-weight:500; } .company-line { margin-top:2px; color:var(--muted); font-size:11px; }
    .party-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .section-title { margin-bottom:8px; padding:4px 10px; background:var(--primary); color:var(--primary-text); font-size:14px; font-weight:700; }
    .info-list { font-size:12px; line-height:1.8; } .info-row { display:grid; grid-template-columns:78px 1fr; } .invoice-info .info-row { grid-template-columns:86px 1fr; }
    .info-row span { border-bottom:1px solid var(--border); min-width:0; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; } .items-table { font-size:11px; }
    .items-table thead { background:var(--primary); color:var(--primary-text); } .items-table th { padding:8px 6px; border:1px solid var(--primary); font-weight:700; }
    .items-table td { height:24px; padding:5.7px 6px; border:1px solid var(--border); line-height:1.15; vertical-align:middle; }
    .items-table td:nth-child(2) { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .row-a { background:var(--row-a); } .row-b { background:var(--row-b); } .center { text-align:center; } .number { text-align:right; font-variant-numeric:tabular-nums; }
    .quantity-wrap { display:flex; justify-content:flex-start; margin-top:10px; } .quantity-table { width:260px; max-width:260px; font-size:12px; }
    .quantity-table td { padding:8px 10px; border:1px solid var(--border); background:var(--surface-muted); font-weight:700; }
    .summary { display:flex; justify-content:${showBalanceDetails ? 'space-between' : 'flex-end'}; align-items:flex-end; gap:16px; margin-top:22px; }
    .balances { max-width:340px; flex:1 1 0; font-size:12px; } .balance-row { display:grid; grid-template-columns:1fr auto; padding:4px 0; font-weight:700; }
    .totals-table { width:350px; max-width:350px; font-size:12px; } .totals-table td { padding:6px 10px; border:2px solid var(--border); }
    .totals-table .total-label { border-color:var(--primary); background:var(--primary); color:var(--primary-text); font-weight:700; }
    .totals-table .total-value { border-color:var(--primary); } .totals-table .muted-cell { background:var(--surface-muted); }
    .prepared-by { margin-top:36px; text-align:right; font-size:11px; font-weight:700; }
  </style>
</head>
<body><main class="pdf-content">${watermarkText ? `<div class="watermark">${escapeHtml(watermarkText)}</div>` : ''}
  <header class="document-header"><div class="document-header-main">
    <div class="document-heading"><h1>${escapeHtml(documentTitle)}</h1><div class="document-meta">
      <div><strong>${escapeHtml(documentNumberLabel)}</strong> ${escapeHtml(invoice.invoiceNumber)}</div>
      <div><strong>Printed On:</strong> ${escapeHtml(formatPrintedAt(printedAt))}</div>
    </div></div>
    <div class="company"><div class="logo-box">
      ${logoDataUri ? `<img src="${escapeHtml(logoDataUri)}" alt="Company Logo" />` : `<span class="logo-fallback">${escapeHtml(initials)}</span>`}
    </div><div class="company-name">${escapeHtml(businessName)}</div>
      ${business.phone ? `<div class="company-line"><strong>Mobile No :</strong> ${escapeHtml(business.phone)}</div>` : ''}
      <div class="company-line">${escapeHtml(businessAddress)}</div>
    </div>
  </div></header>
  <section class="party-grid"><div><div class="section-title">Customer</div><div class="info-list">
    ${renderInfoRow('Code', customer.code)}${renderInfoRow('Name', customer.name)}${renderInfoRow('Address', customer.address)}${renderInfoRow('City', customer.cityName)}
  </div></div><div class="invoice-info"><div class="section-title">${escapeHtml(documentTitle)}</div><div class="info-list">
    ${renderInfoRow('Date', formatDocumentDate(invoice.invoiceDate))}${renderInfoRow('Order No', orderNumber)}
  </div></div></section>
  <table class="items-table"><colgroup><col style="width:8%"/><col style="width:46%"/><col style="width:6%"/><col style="width:8%"/><col style="width:10%"/><col style="width:11%"/><col style="width:11%"/></colgroup>
    <thead><tr><th>No.</th><th>Product</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Discount<br/>Amount</th><th>Amount</th></tr></thead><tbody>${rows.join('')}</tbody>
  </table>
  <div class="quantity-wrap"><table class="quantity-table"><tbody><tr><td>Total Quantity</td><td class="number">${escapeHtml(formatPakistaniNumber(overallQuantity, 0))}</td></tr></tbody></table></div>
  <section class="summary">${showBalanceDetails ? `<div class="balances"><div class="balance-row"><span>Previous Balance:</span><span>${money(previousBalance)}</span></div><div class="balance-row"><span>This Bill:</span><span>${money(invoice.totalAmount)}</span></div><div class="balance-row"><span>Current Balance:</span><span>${money(currentBalance)}</span></div></div>` : ''}
    <table class="totals-table"><tbody><tr><td class="total-label">Total</td><td class="number total-value">${money(subTotal)}</td></tr><tr><td class="muted-cell">Less Discount</td><td class="number muted-cell">${money(invoice.totalDiscountAmount)}</td></tr><tr><td class="muted-cell">Delivery Cost</td><td class="number muted-cell">${money(invoice.deliveryCost)}</td></tr><tr><td class="muted-cell"><strong>Total Amount</strong></td><td class="number muted-cell"><strong>${money(invoice.totalAmount)}</strong></td></tr></tbody></table>
  </section><div class="prepared-by">Prepared By: Admin</div>
</main></body></html>`;
};
