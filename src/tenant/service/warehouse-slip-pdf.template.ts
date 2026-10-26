import {
  escapeHtml,
  formatDocumentDate,
  formatPakistaniNumber,
  formatPrintedAt,
  printThemeCssVars,
  resolvePrintThemeColors,
  type PrintThemeColors,
} from 'src/common/pdf';

const MAX_ROWS = 15;

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

const valueOrDash = (value: unknown, dash = '—'): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return dash;
};

const renderMetaRow = (label: string, value: unknown): string => `
  <div class="info-row">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(valueOrDash(value))}</span>
  </div>`;

const renderItemRow = (item: WarehouseSlipItemDto, index: number): string => `
  <tr class="item-row ${index % 2 === 0 ? 'row-a' : 'row-b'}">
    <td class="center">${index + 1}</td>
    <td class="product">${escapeHtml(valueOrDash(item.productName, '-'))}</td>
    <td class="center">${escapeHtml(valueOrDash(item.flavour))}</td>
    <td class="center">${escapeHtml(valueOrDash(item.skuCode || item.barcode))}</td>
    <td class="center">${escapeHtml(valueOrDash(item.uom, '-'))}</td>
    <td class="center quantity">${escapeHtml(formatPakistaniNumber(item.quantity || 0, 0))}</td>
  </tr>`;

const renderEmptyRow = (index: number): string => `
  <tr class="item-row empty-row ${index % 2 === 0 ? 'row-a' : 'row-b'}">
    <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
  </tr>`;

export const buildWarehouseSlipPdfHtml = (
  slip: WarehouseSlipDto,
  company: WarehouseSlipCompanyContext,
  logoDataUri?: string | null,
  printedAt: Date = new Date(),
  options?: {
    theme?:
      | PrintThemeColors
      | Parameters<typeof resolvePrintThemeColors>[0]
      | null;
  },
): string => {
  const theme = resolvePrintThemeColors(options?.theme);
  const items = Array.isArray(slip.items) ? slip.items : [];
  const rows = items.map(renderItemRow);
  for (let index = items.length; index < MAX_ROWS; index += 1) {
    rows.push(renderEmptyRow(index));
  }

  const totalQuantity = Number(
    slip.totalQuantity ??
      items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  );
  const companyName = company.name || 'ESP';
  const companyAddress = company.address || '';
  const initials =
    companyName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'EP';
  const logoHtml = logoDataUri
    ? `<img src="${escapeHtml(logoDataUri)}" alt="Company Logo" />`
    : `<span class="logo-fallback">${escapeHtml(initials)}</span>`;

  const warehouseRows: string[] = [];
  if (slip.warehouseLabel)
    warehouseRows.push(renderMetaRow('Warehouse', slip.warehouseLabel));
  if (slip.fromWarehouse)
    warehouseRows.push(renderMetaRow('From', slip.fromWarehouse));
  if (slip.toWarehouse)
    warehouseRows.push(renderMetaRow('To', slip.toWarehouse));
  if (!warehouseRows.length)
    warehouseRows.push(renderMetaRow('Warehouse', '-'));

  const partyRows = slip.partyLabel
    ? [
        renderMetaRow('Code', slip.partyCode),
        renderMetaRow('Name', slip.partyName),
        ...warehouseRows,
      ]
    : warehouseRows;
  const documentRows = [
    renderMetaRow('Document No.', slip.documentNumber),
    renderMetaRow('Date', formatDocumentDate(slip.documentDate) || '-'),
  ];

  const notesHtml = slip.notes?.trim()
    ? `<section class="notes"><strong>Notes</strong><span>${escapeHtml(slip.notes.trim())}</span></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Warehouse Slip ${escapeHtml(valueOrDash(slip.documentNumber, '-'))}</title>
  <style>
    :root { ${printThemeCssVars(theme)}; --foreground:#17182a; --muted:#667085; --border:#cfd8d4; --surface-muted:#f7f8fb; }
    @page { size:A4 portrait; margin:10mm; }
    * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    html, body { margin:0; padding:0; background:#fff; color:var(--foreground); font-family:Arial,sans-serif; }
    body { width:190mm; font-size:10px; line-height:1.45; }
    .pdf-content { width:190mm; margin:0 auto; padding:0; }
    .document-header { border-bottom:3px solid var(--primary); padding-bottom:10px; margin-bottom:14px; }
    .document-header-main { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; }
    .document-heading { flex:1; }
    h1 { margin:0; color:var(--foreground); font-size:68px; line-height:.9; font-weight:300; }
    .document-meta { margin-top:10px; font-size:12px; line-height:1.5; }
    .company { min-width:130px; text-align:center; }
    .logo-box { width:76px; height:76px; margin:0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .logo-box img { width:100%; height:100%; object-fit:contain; }
    .logo-fallback { color:var(--primary); font-size:44px; line-height:1; font-weight:700; }
    .company-details { color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
    .company-name { margin-top:4px; color:var(--foreground); font-size:13px; line-height:1.2; font-weight:500; }
    .company-line { margin-top:2px; color:var(--muted); font-size:11px; }
    .party-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
    .section-title { margin-bottom:8px; padding:4px 10px; background:var(--primary); color:var(--primary-text); font-size:14px; font-weight:700; }
    .info-list { font-size:12px; line-height:1.8; }
    .info-row { display:grid; grid-template-columns:78px minmax(0,1fr); }
    .document-info .info-row { grid-template-columns:86px minmax(0,1fr); }
    .info-row span { border-bottom:1px solid var(--border); min-width:0; }
    .notes { display:grid; grid-template-columns:70px minmax(0,1fr); gap:0; margin-bottom:14px; overflow-wrap:anywhere; }
    .notes span { border-bottom:1px solid var(--border); }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .items-table { font-size:11px; }
    .items-table thead { background:var(--primary); color:var(--primary-text); }
    .items-table th { padding:8px 6px; border:1px solid var(--primary); font-weight:700; text-align:center; }
    .items-table td { height:24px; padding:5.7px 6px; border:1px solid var(--border); line-height:1.15; vertical-align:middle; }
    .items-table .product { overflow-wrap:anywhere; }
    .items-table .quantity { font-weight:700; font-variant-numeric:tabular-nums; }
    .row-a { background:var(--row-a); } .row-b { background:var(--row-b); } .center { text-align:center; }
    .quantity-wrap { display:flex; justify-content:flex-start; margin-top:10px; }
    .quantity-table { width:260px; max-width:260px; font-size:12px; }
    .quantity-table td { padding:8px 10px; border:1px solid var(--border); background:var(--surface-muted); font-weight:700; }
    .quantity-table td:last-child { color:var(--primary); text-align:right; font-variant-numeric:tabular-nums; }
    .signatures { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; margin-top:18mm; text-align:center; font-size:10px; }
    .signatures div { display:flex; min-height:30mm; flex-direction:column; justify-content:flex-end; }
    .signatures div::before { content:""; margin-bottom:7px; border-top:1px solid var(--border); }
    @media print {
      .notes,.items-table tr,.quantity-wrap,.signatures { break-inside:avoid; }
    }
  </style>
</head>
<body>
  <main class="pdf-content">
    <header class="document-header">
      <div class="document-header-main">
        <div class="document-heading">
          <h1>Warehouse Slip</h1>
          <div class="document-meta">
            <div><strong>Document No.</strong> ${escapeHtml(valueOrDash(slip.documentNumber, '-'))}</div>
            <div><strong>Printed On:</strong> ${escapeHtml(formatPrintedAt(printedAt))}</div>
          </div>
        </div>
        <div class="company">
          <div class="logo-box">${logoHtml}</div>
          <div class="company-details">
            <div class="company-name">${escapeHtml(companyName)}</div>
            ${company.phone?.trim() ? `<div class="company-line"><strong>Mobile No :</strong> ${escapeHtml(company.phone.trim())}</div>` : ''}
            ${companyAddress ? `<div class="company-line">${escapeHtml(companyAddress)}</div>` : ''}
          </div>
        </div>
      </div>
    </header>

    <section class="party-grid">
      <div>
        <div class="section-title">${escapeHtml(slip.partyLabel || 'Warehouse Movement')}</div>
        <div class="info-list">${partyRows.join('')}</div>
      </div>
      <div class="document-info">
        <div class="section-title">${escapeHtml(slip.documentTypeLabel || 'Document')}</div>
        <div class="info-list">${documentRows.join('')}</div>
      </div>
    </section>

    ${notesHtml}

    <table class="items-table">
      <colgroup><col style="width:7%"/><col style="width:38%"/><col style="width:14%"/><col style="width:14%"/><col style="width:12%"/><col style="width:15%"/></colgroup>
      <thead><tr><th>#</th><th style="text-align:left">Product</th><th>Flavour</th><th>SKU / Barcode</th><th>UOM</th><th>Qty</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>

    <div class="quantity-wrap">
      <table class="quantity-table"><colgroup><col style="width:75%"/><col style="width:25%"/></colgroup><tbody><tr><td>Total Quantity</td><td>${escapeHtml(formatPakistaniNumber(totalQuantity, 0))}</td></tr></tbody></table>
    </div>

    <footer class="signatures">
      <div>Prepared By</div><div>Issued By</div><div>Received By</div>
    </footer>
  </main>
</body>
</html>`;
};
