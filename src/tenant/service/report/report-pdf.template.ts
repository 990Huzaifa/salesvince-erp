import {
  escapeHtml,
  formatDocumentDate,
  formatPakistaniNumber,
  formatPrintedAt,
  type BusinessPdfContext,
} from 'src/common/pdf';

export type ReportPdfLayout = 'balance' | 'party-ledger' | 'summary';

export type ReportPdfColumn = {
  label: string;
  key: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  format?: 'amount' | 'text';
};

export type ReportPdfSection = {
  title?: string;
  columns: ReportPdfColumn[];
  rows: Record<string, unknown>[];
  emptyMessage?: string;
};

export type ReportPdfDocument = {
  layout: ReportPdfLayout;
  title: string;
  subtitle?: string;
  business: BusinessPdfContext;
  logoDataUri?: string | null;
  filters: Array<{ label: string; value?: string | number | null }>;
  summary: Array<{ label: string; value: string | number }>;
  sections: ReportPdfSection[];
  preparedBy?: string;
  footerRight?: string;
  minimumRows?: number;
};

const PRIMARY = '#2d5f3e';
const BORDER = '#d9e2dc';
const FOREGROUND = '#1a1a2e';
const MUTED = '#66746b';
const ROW_A = 'rgba(45,95,62,.08)';
const ROW_B = 'rgba(45,95,62,.04)';
const SUMMARY_ROW_A = 'rgba(151,134,238,.06)';
const SUMMARY_ROW_B = 'rgba(151,134,238,.03)';

const text = (value: unknown, fallback = '-'): string => {
  if (value === null || value === undefined || value === '') {
    return escapeHtml(fallback);
  }
  return escapeHtml(value);
};

const cellValue = (
  row: Record<string, unknown>,
  column: ReportPdfColumn,
): string =>
  column.format === 'amount'
    ? escapeHtml(formatPakistaniNumber(row[column.key]))
    : text(row[column.key]);

const initialsFor = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'EP';

export const formatReportDateRange = (
  startDate?: string | null,
  endDate?: string | null,
): string => {
  if (!startDate && !endDate) return 'All Time';
  if (startDate && endDate) {
    return `${formatDocumentDate(startDate)} to ${formatDocumentDate(endDate)}`;
  }
  return formatDocumentDate(startDate || endDate);
};

const renderCompany = (report: ReportPdfDocument): string => {
  const businessName = report.business.name || 'Eeman Prime';
  const solidLogo = report.layout === 'summary';
  const logoSize = report.layout === 'balance' ? 76 : 96;

  return `<div class="company">
    <div class="logo-box${solidLogo ? ' logo-box-solid' : ''}" style="width:${logoSize}px;height:${logoSize}px">
      ${report.logoDataUri ? `<img src="${text(report.logoDataUri, '')}" alt="Company Logo"/>` : `<span class="logo-fallback">${text(initialsFor(businessName))}</span>`}
    </div>
    <div class="company-name">${text(businessName)}</div>
    ${report.layout !== 'summary' && report.business.phone ? `<div class="company-line"><strong>Mobile No :</strong> ${text(report.business.phone)}</div>` : ''}
    ${report.business.address ? `<div class="company-line">${text(report.business.address)}</div>` : ''}
  </div>`;
};

const renderHeader = (report: ReportPdfDocument, printedAt: Date): string => {
  const filters = report.filters
    .filter((item) => item.value !== null && item.value !== undefined && item.value !== '')
    .map((item) => `<div><strong>${text(item.label)}:</strong> ${text(item.value)}</div>`)
    .join('');
  const includeReportDate = report.layout !== 'balance';

  return `<header class="header"><div class="header-main"><div class="title">
    <h1>${text(report.title)}</h1>
    ${report.subtitle ? `<div class="subtitle">${text(report.subtitle)}</div>` : ''}
    <div class="meta">${filters}${includeReportDate ? `<div><strong>Report Date:</strong> ${text(formatDocumentDate(printedAt))}</div>` : ''}<div><strong>Printed On:</strong> ${text(formatPrintedAt(printedAt))}</div></div>
  </div>${renderCompany(report)}</div></header>`;
};

const renderSummary = (report: ReportPdfDocument): string => {
  if (report.summary.length === 0) return '';
  const columns = Math.min(report.summary.length, 4);
  return `<div class="summary" style="grid-template-columns:repeat(${columns},1fr)">${report.summary.map((item) => `<div class="summary-card"><div class="summary-label">${text(item.label)}</div><div class="summary-value">${text(item.value)}</div></div>`).join('')}</div>`;
};

const renderSection = (report: ReportPdfDocument, section: ReportPdfSection): string => {
  const columnWidths = section.columns
    .map((column) => `<col style="width:${column.width || 'auto'}" />`)
    .join('');
  const headers = section.columns.map((column) => `<th style="width:${column.width || 'auto'};text-align:${column.align || 'left'}">${text(column.label)}</th>`).join('');
  const rows = section.rows.map((row, index) => `<tr class="${index % 2 === 0 ? 'row-a' : 'row-b'}">${section.columns.map((column) => `<td style="text-align:${column.align || 'left'}">${cellValue(row, column)}</td>`).join('')}</tr>`);

  if (section.rows.length === 0) {
    rows.push(`<tr><td colspan="${section.columns.length}" class="empty">${text(section.emptyMessage || 'No records found')}</td></tr>`);
  } else if (report.layout === 'balance') {
    const targetRows = Math.max(0, report.minimumRows ?? 12);
    for (let index = section.rows.length; index < targetRows; index += 1) {
      rows.push(`<tr class="empty-row ${index % 2 === 0 ? 'row-a' : 'row-b'}">${section.columns.map(() => '<td>&nbsp;</td>').join('')}</tr>`);
    }
  }

  return `<section class="report-section">${section.title ? `<h2>${text(section.title)}</h2>` : ''}<table><colgroup>${columnWidths}</colgroup><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table></section>`;
};

const renderFooter = (report: ReportPdfDocument, printedAt: Date): string => {
  const right = report.footerRight || (report.layout === 'balance' ? `Printed On: ${formatPrintedAt(printedAt)}` : '');
  return `<footer class="footer"><span>Prepared By: ${text(report.preparedBy || 'Admin')}</span>${right ? `<span>${text(right)}</span>` : ''}</footer>`;
};

export const buildReportPdfHtml = (report: ReportPdfDocument, printedAt: Date = new Date()): string => {
  const sections = report.sections.map((section) => renderSection(report, section)).join('');
  const isSummary = report.layout === 'summary';
  const isPartyLedger = report.layout === 'party-ledger';
  const isBalance = report.layout === 'balance';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${text(report.title)}</title><style>
    @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;color:${FOREGROUND};font-size:11px}body{font-size:11px}
    .pdf-content{width:210mm;margin:0 auto;padding:10mm}.header{border-bottom:3px solid ${PRIMARY};padding-bottom:10px;margin-bottom:${isSummary ? '14px' : '16px'}}
    .header-main{display:flex;justify-content:space-between;align-items:${isSummary ? 'flex-start' : 'flex-end'};gap:16px}.title{flex:1}.title h1{margin:0;font-size:${isPartyLedger ? '68px' : isSummary ? '44px' : '48px'};line-height:${isPartyLedger ? '.9' : '.95'};font-weight:300;color:${FOREGROUND}}.subtitle{margin-top:6px;font-size:12px;color:${MUTED}}
    .meta{margin-top:10px;font-size:12px;line-height:${isBalance ? '1.6' : '1.5'}}.company{min-width:${isBalance ? '140px' : '130px'};text-align:center}.logo-box{margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;background:transparent}.logo-box-solid{background:${PRIMARY}}.logo-box img{width:100%;height:100%;object-fit:contain;background:#fff}.logo-fallback{color:${PRIMARY};font-size:44px;line-height:1;font-weight:700}.logo-box-solid .logo-fallback{color:#fff}.company-name{margin-top:4px;font-size:13px;line-height:1.2;font-weight:${isBalance ? '600' : '500'}}.company-line{margin-top:${isBalance ? '3px' : '2px'};color:${MUTED};font-size:11px}
    .summary{display:grid;gap:8px;margin-bottom:14px}.summary-card{border:1px solid ${BORDER};border-radius:${isSummary ? '8px' : '0'};padding:${isBalance ? '9px 11px' : '10px 12px'};background:#fff}.summary-label{color:${MUTED};font-size:${isBalance ? '10px' : '11px'}}.summary-value{margin-top:${isBalance ? '3px' : '4px'};font-size:${isBalance ? '17px' : '18px'};font-weight:700}
    .report-section{margin-bottom:14px;break-inside:auto}.report-section h2{margin:0 0 8px;font-size:${isSummary ? '16px' : '15px'};${isSummary ? `color:${FOREGROUND}` : `padding:5px 10px;color:#fff;background:${PRIMARY}`}}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${isPartyLedger ? '10px' : '10.5px'}}thead{display:table-header-group}th,td{border:1px solid ${BORDER};padding:6px;vertical-align:top;overflow-wrap:anywhere}th{padding:${isBalance ? '8px 6px' : '7px 6px'};border-color:${PRIMARY};background:${PRIMARY};color:#fff;font-weight:700}tr{break-inside:avoid}.row-a{background:${isSummary ? SUMMARY_ROW_A : ROW_A}}.row-b{background:${isSummary ? SUMMARY_ROW_B : ROW_B}}.empty{padding:10px 6px;text-align:center}.empty-row td{height:27px}.footer{display:flex;justify-content:space-between;gap:16px;margin-top:24px;${isBalance ? `padding-top:10px;border-top:2px solid ${PRIMARY};` : ''}font-size:11px;font-weight:700}
  </style></head><body><main class="pdf-content layout-${report.layout}">${renderHeader(report, printedAt)}${renderSummary(report)}${sections}${renderFooter(report, printedAt)}</main></body></html>`;
};
