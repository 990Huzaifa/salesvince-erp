import {
  formatPakistaniNumber,
  formatPrintedAt,
  type BusinessPdfContext,
  escapeHtml,
} from 'src/common/pdf';

export type ReportPdfColumn = {
  label: string;
  key: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  format?: 'amount' | 'text';
};

export type ReportPdfSection = {
  title: string;
  columns: ReportPdfColumn[];
  rows: Record<string, unknown>[];
  emptyMessage?: string;
};

export type ReportPdfDocument = {
  title: string;
  subtitle: string;
  business: BusinessPdfContext;
  logoDataUri?: string | null;
  filters: Array<{ label: string; value: string }>;
  summary: Array<{ label: string; value: string }>;
  sections: ReportPdfSection[];
  preparedBy?: string;
};

const text = (value: unknown): string => escapeHtml(value == null ? '-' : String(value));
const amount = (value: unknown): string => escapeHtml(formatPakistaniNumber(value));

const cell = (row: Record<string, unknown>, column: ReportPdfColumn): string => {
  const value = row[column.key];
  return column.format === 'amount' ? amount(value) : text(value);
};

export const buildReportPdfHtml = (
  report: ReportPdfDocument,
  printedAt: Date = new Date(),
): string => {
  const businessName = report.business.name || 'Eeman Prime';
  const initials = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'EP';
  const filters = report.filters
    .filter((item) => item.value)
    .map((item) => `<div><strong>${text(item.label)}:</strong> ${text(item.value)}</div>`)
    .join('');
  const summary = report.summary
    .map((item) => `<div class="summary-card"><div class="summary-label">${text(item.label)}</div><div class="summary-value">${text(item.value)}</div></div>`)
    .join('');
  const sections = report.sections.map((section) => {
    const headers = section.columns.map((column) => `<th style="width:${column.width || 'auto'};text-align:${column.align || 'left'}">${text(column.label)}</th>`).join('');
    const rows = section.rows.length
      ? section.rows.map((row, index) => `<tr class="${index % 2 === 0 ? 'row-a' : 'row-b'}">${section.columns.map((column) => `<td style="text-align:${column.align || 'left'}">${cell(row, column)}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${section.columns.length}" class="empty">${text(section.emptyMessage || 'No records found')}</td></tr>`;
    return `<section class="report-section"><h2>${text(section.title)}</h2><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${text(report.title)}</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#17182a;font-size:11px}
    .pdf-content{width:277mm;padding:0}.header{border-bottom:3px solid #2d6544;padding-bottom:10px;margin-bottom:14px}
    .header-main{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}.title{flex:1}.title h1{margin:0;font-size:48px;line-height:.95;font-weight:300;color:#1a1a2e}.subtitle{margin-top:6px;color:#66746b;font-size:12px}
    .meta{margin-top:10px;font-size:12px;line-height:1.6}.company{text-align:center;min-width:140px}.logo-box{width:76px;height:76px;margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:transparent}
    .logo-box img{width:100%;height:100%;object-fit:contain}.logo-fallback{color:#2d6544;font-size:44px;font-weight:700}.company-name{margin-top:4px;font-size:13px;font-weight:600}.company-line{margin-top:3px;font-size:11px;color:#66746b}
    .summary{display:grid;gap:8px;margin-bottom:14px}.summary-card{border:1px solid #d9e2dc;padding:9px 11px;background:#fff}.summary-label{font-size:10px;color:#66746b}.summary-value{margin-top:3px;font-size:17px;font-weight:700}
    .report-section{margin-bottom:14px;break-inside:auto}.report-section h2{margin:0 0 8px;padding:5px 10px;font-size:15px;color:#fff;background:#2d6544}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px}thead{display:table-header-group}th,td{border:1px solid #d9e2dc;padding:6px;vertical-align:top}th{background:#2d6544;color:#fff;font-weight:700}.row-a{background:rgba(45,101,68,.06)}.row-b{background:rgba(45,101,68,.03)}.empty{text-align:center}.footer{display:flex;justify-content:space-between;gap:16px;font-size:11px;font-weight:600;margin-top:24px;padding-top:10px;border-top:2px solid #2d6544}
  </style></head><body><main class="pdf-content"><header class="header"><div class="header-main"><div class="title"><h1>${text(report.title)}</h1><div class="subtitle">${text(report.subtitle)}</div><div class="meta">${filters}<div><strong>Printed On:</strong> ${text(formatPrintedAt(printedAt))}</div></div></div><div class="company"><div class="logo-box">${report.logoDataUri ? `<img src="${text(report.logoDataUri)}" alt="Company Logo"/>` : `<span class="logo-fallback">${text(initials)}</span>`}</div><div class="company-name">${text(businessName)}</div>${report.business.phone ? `<div class="company-line"><strong>Mobile No :</strong> ${text(report.business.phone)}</div>` : ''}${report.business.address ? `<div class="company-line">${text(report.business.address)}</div>` : ''}</div></div></header>${report.summary.length ? `<div class="summary" style="grid-template-columns:repeat(${Math.min(report.summary.length, 4)},1fr)">${summary}</div>` : ''}${sections}<div class="footer"><span>Prepared By: ${text(report.preparedBy || 'Admin')}</span><span>Printed On: ${text(formatPrintedAt(printedAt))}</span></div></main></body></html>`;
};
