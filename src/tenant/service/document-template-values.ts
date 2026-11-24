import { toWords } from 'to-words/en-IN';
import { formatDocumentDate } from 'src/common/pdf';
import type { ReportPdfDocument } from './report/report-pdf.types';

type TemplateData = Record<string, unknown>;

const amounts = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantities = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const dates = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const asNumber = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const number = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(number) ? number : undefined;
};

function formatDate(value: unknown, timeZone: string) {
  if (!(value instanceof Date) && typeof value !== 'string') return '';
  const formatted = formatDocumentDate(value, timeZone);
  const parts = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return parts ? dates.format(Date.UTC(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]))) : formatted;
}

function amountInWords(number: number, currency: string) {
  if (!Number.isSafeInteger(Math.trunc(number))) return '';
  const [whole, fraction] = amounts.format(Math.abs(number)).replaceAll(',', '').split('.');
  const units = currency === 'PKR' ? 'Rupees' : currency;
  const subunits = currency === 'PKR' ? 'paisa' : 'hundredths';
  const decimal = Number(fraction) ? ` and ${toWords(Number(fraction)).toLowerCase()} ${subunits}` : '';
  return `${number < 0 ? 'Minus ' : ''}${units} ${toWords(Number(whole)).toLowerCase()}${decimal} only`;
}

export function readDocumentTemplateValue(path: string, read: (key: string) => unknown, namespace: string, timeZone: string) {
  if (path === `${namespace}Footer`) {
    const name = read('preparedBy') || read('companyInfo.preparedBy') || read('report.preparedBy');
    return name ? `Prepared by: ${name}`.replace(/[\\'"<>&\u0000-\u001f\u007f]/gu,
      (character) => `\\${character.codePointAt(0)!.toString(16)} `) : '';
  }
  const match = path.startsWith(namespace) ? path.slice(namespace.length).match(/^(Amount|NonzeroAmount|Percent|Quantity|Words|Date)\.(.+)$/) : null;
  if (!match) return read(path);
  const [, format, field] = match;
  const value = read(field);
  if (format === 'Date') return formatDate(value, timeZone);
  const number = asNumber(value);
  if (number === undefined) return '';
  if (format === 'Percent') return number ? `${quantities.format(number)}%` : '–';
  if (format === 'Quantity') return quantities.format(number);
  if (format === 'Words') return amountInWords(number, String(read('companyInfo.currency') || 'PKR').toUpperCase());
  return format === 'NonzeroAmount' && number === 0 ? '' : amounts.format(number);
}

function invoiceTotals(items: TemplateData[], isPurchaseOrder: boolean) {
  const units = new Map<string, number>();
  let subtotal = 0;
  for (const item of items) {
    const quantity = asNumber(item.quantity ?? item.qty) ?? 0;
    const unit = String(item.measurement_unit ?? (item.uom as TemplateData | undefined)?.name ?? '');
    const unitPrice = asNumber(item.unit_price ?? (isPurchaseOrder ? item.purchaseUnitPrice : item.saleUnitPrice) ?? item.purchaseUnitPrice ?? item.rate);
    subtotal += unitPrice === undefined ? asNumber(item.total ?? item.totalAmount) ?? 0 : quantity * unitPrice;
    units.set(unit, (units.get(unit) ?? 0) + quantity);
  }
  const quantity = [...units].map(([unit, number]) => `${quantities.format(number)} ${unit}`.trim()).join(' / ');
  return { itemCount: `${items.length} ${items.length === 1 ? 'item' : 'items'}`, quantity, subtotal };
}

// Saved layouts use a flat row loop. Preserve each report section's columns,
// headings and empty state when adapting reports with multiple tables.
function buildReportRows(sections: ReportPdfDocument['sections']) {
  const columnCount = Math.min(16, Math.max(1, ...sections.map(({ columns }) => columns.length)));
  return sections.flatMap(({ title, columns, rows, emptyMessage }) => {
    const visibleColumns = columns.slice(0, columnCount);
    const spanningCell = (text: string, rowClass = '') => ({ rowClass, c0: { text, present: true, span: columnCount } });
    const makeRow = (rowClass: string, cell: (column: typeof columns[number]) => unknown) => ({
      rowClass,
      ...Object.fromEntries(visibleColumns.map((column, index) => [`c${index}`, {
        text: cell(column),
        present: true,
        span: index === visibleColumns.length - 1 ? columnCount - index : 1,
        align: column.align === 'right' || column.align === 'center' ? column.align : '',
        width: /^\d+(?:\.\d+)?%$/.test(column.width ?? '') ? column.width : '',
      }])),
    });
    return [
      ...(title ? [spanningCell(title, 'section-title')] : []),
      makeRow('section-columns', (column) => column.label),
      ...(rows.length ? rows.map((row) => makeRow('', (column) => {
        const value = row[column.key];
        const number = column.format === 'amount' ? asNumber(value) : undefined;
        return number === undefined ? value : amounts.format(number);
      })) : [spanningCell(emptyMessage || 'No records found.')]),
    ];
  });
}

export function prepareDocumentTemplateData(data: TemplateData, namespace: string) {
  const report = data.report as ReportPdfDocument | undefined;
  const company = data.companyInfo as TemplateData | undefined;
  const invoice = (data.invoice || data.order || data.purchaseOrder) as { items?: TemplateData[] } | undefined;
  const paySlip = data.paySlip as TemplateData | undefined;
  return {
    ...data,
    companyInfo: {
      ...company,
      mobile: company?.mobile || company?.phone,
      currency: paySlip?.currency || company?.currency,
      logo: company?.logo || report?.logoDataUri || data.logoDataUri,
    },
    [`${namespace}Totals`]: Array.isArray(invoice?.items) ? invoiceTotals(invoice.items, Boolean(data.purchaseOrder && !data.invoice && !data.order)) : undefined,
    [`${namespace}ReportRows`]: report?.sections ? buildReportRows(report.sections) : undefined,
    [`${namespace}ReportFilters`]: report?.filters,
    [`${namespace}ReportSummary`]: report?.summary,
  };
}
