import {
  escapeHtml,
  formatDocumentDate,
  formatPakistaniNumber,
  formatPrintedAt,
  printThemeCssVars,
  resolvePrintThemeColors,
  type PrintThemeColors,
} from 'src/common/pdf';

const MAX_ROWS = 12;

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

const renderMetaRow = (label: string, value: string): string => `
  <div class="meta-row">
    <strong>${escapeHtml(label)}</strong>
    <span>${escapeHtml(value)}</span>
  </div>`;

const renderItemRow = (item: WarehouseSlipItemDto, index: number): string => `
  <tr class="${index % 2 === 0 ? 'row-a' : 'row-b'}">
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(valueOrDash(item.productName, '-'))}</td>
    <td class="center">${escapeHtml(valueOrDash(item.flavour))}</td>
    <td class="center">${escapeHtml(valueOrDash(item.skuCode || item.barcode))}</td>
    <td class="center">${escapeHtml(valueOrDash(item.uom, '-'))}</td>
    <td class="center qty">${escapeHtml(formatPakistaniNumber(item.quantity || 0, 0))}</td>
  </tr>`;

const renderEmptyRow = (index: number): string => `
  <tr class="empty-row ${index % 2 === 0 ? 'row-a' : 'row-b'}">
    <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
  </tr>`;

export const buildWarehouseSlipPdfHtml = (
  slip: WarehouseSlipDto,
  company: WarehouseSlipCompanyContext,
  logoDataUri?: string | null,
  printedAt: Date = new Date(),
  options?: { theme?: PrintThemeColors | Parameters<typeof resolvePrintThemeColors>[0] | null },
): string => {
  const theme = resolvePrintThemeColors(options?.theme);
  const items = Array.isArray(slip.items) ? slip.items : [];
  const emptyRows = Math.max(0, MAX_ROWS - items.length);
  const totalQuantity = Number(
    slip.totalQuantity ??
      items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  );

  const documentMetaRows = [
    renderMetaRow('Doc No.', valueOrDash(slip.documentNumber, '-')),
    renderMetaRow('Date', formatDocumentDate(slip.documentDate) || '-'),
  ];

  if (slip.partyLabel) {
    const partyValue = [
      slip.partyCode ? `${slip.partyCode} - ` : '',
      slip.partyName || '-',
    ].join('');
    documentMetaRows.push(renderMetaRow(slip.partyLabel, partyValue));
  }
  if (slip.warehouseLabel) {
    documentMetaRows.push(renderMetaRow('Warehouse', slip.warehouseLabel));
  }
  if (slip.fromWarehouse) {
    documentMetaRows.push(renderMetaRow('From', slip.fromWarehouse));
  }
  if (slip.toWarehouse) {
    documentMetaRows.push(renderMetaRow('To', slip.toWarehouse));
  }

  const companyRows: string[] = [];
  if (company.phone?.trim()) {
    companyRows.push(
      `<div><strong>Phone:</strong> ${escapeHtml(company.phone.trim())}</div>`,
    );
  }
  if (company.address?.trim()) {
    companyRows.push(
      `<div><strong>Address:</strong> ${escapeHtml(company.address.trim())}</div>`,
    );
  }
  companyRows.push(
    `<div><strong>Printed On:</strong> ${escapeHtml(formatPrintedAt(printedAt))}</div>`,
  );

  const logoHtml = logoDataUri
    ? `<img src="${logoDataUri}" alt="Company Logo" />`
    : `<span class="logo-fallback">SV</span>`;

  const notesHtml = slip.notes?.trim()
    ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(slip.notes.trim())}</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    ${printThemeCssVars(theme)}
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, sans-serif;
      color: #1a1a2e;
    }
    body { width: 190mm; }
    .pdf-content { width: 190mm; margin: 0 auto; padding: 0; }
    .header {
      border-bottom: 3px solid var(--primary);
      padding-bottom: 10px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    .title { margin: 0; font-size: 42px; line-height: 0.95; font-weight: 300; }
    .subtitle { margin-top: 8px; font-size: 12px; color: #6b7280; }
    .company-block { text-align: center; min-width: 110px; }
    .logo-box {
      width: 84px;
      height: 84px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .logo-box img { width: 100%; height: 100%; object-fit: contain; }
    .logo-fallback { color: var(--primary); font-size: 36px; font-weight: 700; }
    .company-name { margin-top: 6px; font-size: 12px; font-weight: 700; }
    .meta-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .card {
      border: 1px solid #cfd8d4;
      border-radius: 8px;
      padding: 12px;
    }
    .card-muted { background: #f7f8fb; }
    .card-title { font-weight: 700; margin-bottom: 8px; color: var(--primary); }
    .meta-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 6px;
      margin-bottom: 6px;
    }
    .notes {
      margin-bottom: 14px;
      border: 1px solid #cfd8d4;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      background: #f7f8fb;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 11px;
    }
    table.items th {
      padding: 8px 6px;
      border: 1px solid var(--primary);
      background: var(--primary);
      color: var(--primary-fg);
      font-weight: 700;
    }
    table.items td {
      border: 1px solid #cfd8d4;
      padding: 6px;
      vertical-align: top;
    }
    .center { text-align: center; }
    .qty { font-weight: 700; }
    .row-a { background: var(--row-a); }
    .row-b { background: var(--row-b); }
    .empty-row td { height: 24px; }
    .total-wrap { margin-top: 12px; }
    table.total {
      width: 260px;
      border-collapse: collapse;
      font-size: 12px;
    }
    table.total td {
      border: 1px solid #cfd8d4;
      padding: 8px 10px;
      background: #f7f8fb;
      font-weight: 700;
    }
    table.total td.right { text-align: right; }
    .signatures {
      margin-top: 40px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      font-size: 11px;
      text-align: center;
    }
    .signatures div { border-top: 1px solid #cfd8d4; padding-top: 8px; }
  </style>
</head>
<body>
  <main class="pdf-content">
    <div class="header">
      <div>
        <h1 class="title">Warehouse Slip</h1>
        <div class="subtitle">Product movement copy — no pricing</div>
      </div>
      <div class="company-block">
        <div class="logo-box">${logoHtml}</div>
        <div class="company-name">${escapeHtml(company.name || 'Salesvince')}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="card card-muted">
        <div class="card-title">${escapeHtml(slip.documentTypeLabel || 'Document')}</div>
        ${documentMetaRows.join('')}
      </div>
      <div class="card">
        <div class="card-title">Company</div>
        <div style="display:grid;row-gap:6px;">${companyRows.join('')}</div>
      </div>
    </div>

    ${notesHtml}

    <table class="items">
      <colgroup>
        <col style="width:7%" />
        <col style="width:38%" />
        <col style="width:14%" />
        <col style="width:14%" />
        <col style="width:12%" />
        <col style="width:15%" />
      </colgroup>
      <thead>
        <tr>
          <th>#</th>
          <th style="text-align:left">Product</th>
          <th>Flavour</th>
          <th>SKU / Barcode</th>
          <th>UOM</th>
          <th>Qty</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => renderItemRow(item, index)).join('')}
        ${Array.from({ length: emptyRows }, (_, i) =>
          renderEmptyRow(items.length + i),
        ).join('')}
      </tbody>
    </table>

    <div class="total-wrap">
      <table class="total">
        <tr>
          <td>Total Quantity</td>
          <td class="right">${escapeHtml(formatPakistaniNumber(totalQuantity, 0))}</td>
        </tr>
      </table>
    </div>

    <div class="signatures">
      <div>Prepared By</div>
      <div>Issued By</div>
      <div>Received By</div>
    </div>
  </main>
</body>
</html>`;
};
