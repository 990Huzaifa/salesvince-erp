import {
  formatDocumentDate,
  formatPakistaniNumber,
  formatPrintedAt,
  prettifyValue,
} from 'src/common/pdf';
import { escapeHtml } from 'src/common/pdf';
import type { BusinessPdfContext } from 'src/common/pdf';

type GeneralLedgerPdfEntry = {
  transactionDate?: string | Date | null;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  debitAmount?: number | null;
  creditAmount?: number | null;
  balance?: number | null;
};

export type GeneralLedgerPdfDocument = {
  accountId: string;
  vendor: string;
  entries: GeneralLedgerPdfEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  business: BusinessPdfContext;
  preparedBy: string;
};

const money = (value: unknown): string =>
  escapeHtml(formatPakistaniNumber(value));

const text = (value: unknown): string => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return escapeHtml(String(value));
  }
  return '';
};

export const buildGeneralLedgerPdfHtml = (
  ledger: GeneralLedgerPdfDocument,
  logoDataUri?: string | null,
  printedAt: Date = new Date(),
): string => {
  const businessName = ledger.business.name || 'Eeman Prime';
  const businessAddress = ledger.business.address || 'Shahrah e faisal Karachi';
  const initials =
    businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'EP';
  const rows = ledger.entries
    .map(
      (entry, index) => `
    <tr class="${index % 2 === 0 ? 'row-a' : 'row-b'}">
      <td>${text(formatDocumentDate(entry.transactionDate))}</td>
      <td>${text(prettifyValue(entry.referenceType))}</td>
      <td>${text(entry.referenceId)}</td>
      <td>${text(entry.description)}</td>
      <td class="number">${entry.debitAmount ? money(entry.debitAmount) : ''}</td>
      <td class="number">${entry.creditAmount ? money(entry.creditAmount) : ''}</td>
      <td class="number">${money(entry.balance)}</td>
    </tr>`,
    )
    .join('');
  const emptyRows = Math.max(0, 15 - ledger.entries.length);
  const blanks = Array.from(
    { length: emptyRows },
    (_, index) => `
    <tr class="${(ledger.entries.length + index) % 2 === 0 ? 'row-a' : 'row-b'}">
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
    </tr>`,
  ).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
    <title>General Ledger ${text(ledger.accountId)}</title><style>
    :root { --primary:#9786ee; --primary-text:#fff; --foreground:#17182a; --muted:#667085; --border:#e5e8f0; --row-a:rgba(151,134,238,.06); --row-b:rgba(151,134,238,.03); --surface-muted:#f7f8fc; }
    @page { size:A4 portrait; margin:10mm; } * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    html,body { margin:0; padding:0; background:#fff; font-family:Arial,sans-serif; color:#000; } body { width:190mm; }
    .pdf-content { width:190mm; margin:0 auto; padding:0; } .document-header { border-bottom:3px solid var(--primary); padding-bottom:10px; margin-bottom:16px; }
    .document-header-main { display:flex; justify-content:space-between; gap:16px; } h1 { margin:0; font-size:48px; line-height:.9; font-weight:300; color:var(--foreground); }
    .document-meta { margin-top:10px; font-size:12px; line-height:1.5; } .company { text-align:center; min-width:130px; }
    .logo-box { width:96px; height:96px; margin:0 auto; background:var(--primary); display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; } .logo-fallback { color:var(--primary-text); font-size:44px; font-weight:700; }
    .company-name { margin-top:4px; font-size:13px; font-weight:500; } .company-line { margin-top:2px; font-size:11px; color:var(--muted); }
    table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:11px; } thead { background:var(--primary); color:var(--primary-text); }
    th { padding:8px 6px; border:1px solid var(--border); } td { padding:6px; border:1px solid var(--border); } .row-a { background:var(--row-a); } .row-b { background:var(--row-b); }
    .number { text-align:right; font-variant-numeric:tabular-nums; } .total-row { background:var(--primary); color:var(--primary-text); font-weight:700; }
    .closing-row { background:var(--surface-muted); font-weight:700; } .prepared-by { margin-top:36px; text-align:right; font-size:11px; font-weight:700; }
  </style></head><body><main class="pdf-content">
    <header class="document-header"><div class="document-header-main"><div><h1>General Ledger</h1><div class="document-meta">
      <div><strong>Account ID:</strong> ${text(ledger.accountId)}</div><div><strong>Vendor:</strong> ${text(ledger.vendor)}</div>
      ${ledger.business.phone ? `<div><strong>Mobile No :</strong> ${text(ledger.business.phone)}</div>` : ''}
      <div><strong>Printed On:</strong> ${text(formatPrintedAt(printedAt))}</div>
    </div></div><div class="company"><div class="logo-box">
      ${logoDataUri ? `<img src="${text(logoDataUri)}" alt="Logo" />` : `<span class="logo-fallback">${text(initials)}</span>`}
    </div><div class="company-name">${text(businessName)}</div><div class="company-line">${text(businessAddress)}</div></div></div></header>
    <table><colgroup><col style="width:10%" /><col style="width:10%" /><col style="width:10%" /><col style="width:40%" /><col style="width:10%" /><col style="width:10%" /><col style="width:10%" /></colgroup><thead><tr><th style="width:10%">Date</th><th style="width:10%">Type</th><th style="width:10%">Vr.#</th><th style="width:40%">Narration</th><th style="width:10%">Debit</th><th style="width:10%">Credit</th><th style="width:10%">Balance</th></tr></thead>
    <tbody>${rows}${blanks}<tr class="total-row"><td colspan="4" style="text-align:center">Total</td><td class="number">${money(ledger.totalDebit)}</td><td class="number">${money(ledger.totalCredit)}</td><td>&nbsp;</td></tr>
    <tr class="closing-row"><td colspan="6">Closing Balance</td><td class="number">${money(ledger.closingBalance)}</td></tr></tbody></table>
    <div class="prepared-by">Prepared By: ${text(ledger.preparedBy)}</div>
  </main></body></html>`;
};
