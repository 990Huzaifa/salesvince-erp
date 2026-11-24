import { BadRequestException } from '@nestjs/common';
import { toString as renderQrSvg } from 'qrcode';
import { DOCUMENT_LAYOUT_MARKER } from 'src/common/pdf/document-template-layout';
import { DocumentTemplateDocumentType as Type } from 'src/master-db/entities/document-template-item.entity';

export const DEFAULT_DOCUMENT_VERIFICATION_URL = 'https://google.com/';

const QR_BLOCK = /<!--([a-z][a-z0-9-]*-verification)-->[\s\S]*?<!--\/\1-->/g;
const escapeAttribute = (value: string) => value.replace(/[&"<>{}]/g, (character) => ({
  '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;',
})[character]!);

export async function buildDocumentTemplateVerification(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException('Enter a valid verification URL.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 512) {
    throw new BadRequestException('Enter an HTTP or HTTPS verification URL up to 512 characters.');
  }
  const svg = await renderQrSvg(url.href, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' });
  const markup = `<!--document-verification--><a class="verification" href="${escapeAttribute(url.href)}" target="_blank" rel="noopener noreferrer"><img src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="Verification QR code"><span>Scan to Verify</span></a><!--/document-verification-->`;
  return { url: url.href, markup };
}

export function replaceDocumentTemplateVerification(content: string | null, markup: string): string | null {
  if (!content || [...content.matchAll(QR_BLOCK)].length !== 1) return null;
  return content.replace(QR_BLOCK, (_block, marker: string) => markup
    .replace('<!--document-verification-->', `<!--${marker}-->`)
    .replace('<!--/document-verification-->', `<!--/${marker}-->`));
}

const bind = (...paths: string[]) => paths.map((path) => `<span class="value">{{${path}}}</span>`).join('');
const value = (...paths: string[]) => `<span>${bind(...paths)}</span>`;
const formatted = (format: string, paths: string[]) => value(...paths.flatMap((path) => [`${format}.${path}`, path]));
const money = (...paths: string[]) => formatted('documentAmount', paths);
const quantity = (...paths: string[]) => formatted('documentQuantity', paths);
const date = (...paths: string[]) => formatted('documentDate', paths);
const currency = '<span class="currency" data-currency="{{companyInfo.currency}}"></span>';
const amountHeading = `Amount (${currency})`;

const field = (label: string, content: string, optional = false) =>
  `<div class="field${optional ? ' optional' : ''}"><dt>${label}</dt><dd>${content}</dd></div>`;
const details = (label: string, ...fields: string[]) =>
  `<section class="card"><h2>${label}</h2><dl>${fields.join('')}</dl></section>`;
const party = (label: string, name: string, address = '', phone = '') => `
  <section class="card party"><h2>${label}</h2><strong>${name}</strong>
    <div class="address">${address}</div>${phone ? `<div class="contact">${phone}</div>` : ''}
  </section>`;
const cards = (left: string, right: string) => `<div class="cards">${left}${right}</div>`;

type Column = { label: string; value: string; width?: string; right?: boolean; strong?: boolean };

function table(path: string, columns: Column[], totals = '') {
  const header = columns.map((column) =>
    `<th scope="col" class="${column.right ? 'right' : ''}"${column.width ? ` style="width:${column.width}"` : ''}>${column.label}</th>`,
  ).join('');
  const cells = columns.map((column) =>
    `<td class="${column.right ? 'right' : ''} ${column.strong ? 'strong' : ''}">${column.value}</td>`,
  ).join('');
  return `<table class="records"><thead><tr>${header}</tr></thead><tbody>
    {{#each ${path}}}<tr>${cells}</tr>{{/each}}
    </tbody>${totals ? `<tbody class="table-totals"><tr>${totals}</tr></tbody>` : ''}</table>`;
}

const description = (name: string[], detail: string[]) =>
  `<strong>${value(...name)}</strong><span class="second-line">${bind(...detail)}</span>`;
const totalLine = (label: string, amount: string, optional = false) =>
  `<div class="total-line${optional ? ' optional' : ''}"><span>${label}</span><strong>${amount}</strong></div>`;
const total = (label: string, amount: string, filled = true, showCurrency = true) =>
  `<div class="total${filled ? ' filled' : ''}"><h2>${label}</h2><strong>${showCurrency ? `${currency} ` : ''}${amount}</strong></div>`;
const words = (...paths: string[]) =>
  `<div class="amount-words optional"><h2>Amount in words</h2><p>${bind(...paths.map((path) => `documentWords.${path}`), 'amountInWords')}</p></div>`;
const summary = (left = '', right = '') =>
  `<section class="summary"><div class="scan-details">%%verification%%${left}</div><div>${right}</div></section>`;

type Paper = 'A4' | 'A4 landscape' | 'A5 landscape';

function pageStyles(paper: Paper) {
  const compact = paper === 'A5 landscape';
  const wide = paper === 'A4 landscape';
  const inset = compact ? 10.6 : 11.6;
  return `
  @page{size:${paper};margin:10.7mm ${inset}mm 16mm;
    ${compact ? '' : '@bottom-left{content:"Page " counter(page) "/" counter(pages);font:9.5pt Arial,sans-serif;color:#5b6068;vertical-align:top;padding-top:2pt}'}
    @bottom-right{content:"{{documentFooter}}";font:9.5pt Arial,sans-serif;color:#5b6068;vertical-align:top;padding-top:2pt}
  }
  :root{--accent:var(--primary,#4b5563);--panel:var(--row-a,#f3f4f6);--ink:#232427;--muted:#5b6068;--rule:#e1e3e7}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;background:#fff;color:var(--ink);font:10pt/1.24 Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums}
  h1,h2,p,dl,dd{margin:0}
  h1{font-size:24pt;line-height:1.08;letter-spacing:-.45pt}
  h2{font-size:9pt;letter-spacing:.65pt;text-transform:uppercase;line-height:1.22;color:var(--muted)}
  .header{display:flex;justify-content:space-between;align-items:flex-start;gap:13pt;min-height:50pt;padding-bottom:7.5pt;border-bottom:1.3pt solid var(--accent);break-inside:avoid}
  .brand{display:flex;align-items:center;gap:9pt;min-width:0}
  .brand-logo{width:51pt;min-height:34pt;flex:none;display:grid;place-items:center;color:var(--accent);font-size:20pt;font-weight:700}
  .brand-logo img{max-width:100%!important;max-height:38pt!important}
  .brand-text{min-width:0;overflow-wrap:anywhere;color:var(--muted);font-size:9.3pt}
  .brand-text strong{display:block;color:var(--ink);font-size:15pt;line-height:1.14;margin-bottom:1.5pt}
  .phone:not(:empty)::before{content:"Mobile "}.support:not(:empty)::before{content:"Customer support "}
  .phone:not(:empty) + .support:not(:empty)::before{content:" · Customer support "}
  .heading{text-align:right;max-width:45%;min-width:0;overflow-wrap:anywhere}
  .document-number{display:block;margin-top:3.5pt;color:var(--accent);font-size:11.2pt;letter-spacing:.2pt;font-weight:700}
  .document-number:has(.value:not(:empty))::before{content:"No. "}
  .cards{display:grid;grid-template-columns:1.03fr 1fr;gap:11pt;margin:10.5pt 0 12pt;break-inside:avoid}
  .card{border-radius:8pt;background:var(--panel);min-height:84pt;padding:8.5pt 12pt;overflow-wrap:anywhere}
  .card h2{margin-bottom:5.5pt}
  .party strong{font-size:12.5pt;line-height:1.17}.party .address{white-space:pre-line;margin-top:1.5pt}
  .contact{color:var(--muted);margin-top:2pt}.contact .value{color:var(--ink);font-weight:700}
  .contact:has(.value:not(:empty))::before{content:"Contact "}
  .card dl{display:grid;grid-template-columns:1fr 1fr;gap:4pt 9pt}
  .field dt{color:var(--muted);font-size:9.1pt}.field dd{font-weight:700;margin-top:.5pt}
  .field dd:not(:has(.value:not(:empty),.currency))::after{content:"–"}
  .value:empty,.value:not(:empty)~.value,.optional:not(:has(.value:not(:empty))){display:none}
  .currency::before{content:attr(data-currency)}.currency:is([data-currency=""],[data-currency="PKR"],[data-currency="Rs"])::before{content:"Rs"}
  .currency-detail:is([data-currency=""],[data-currency="PKR"],[data-currency="Rs"])::before{content:"PKR (Rs)"}
  .records{border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:10pt}
  .records thead{display:table-header-group}
  .records tr{break-inside:avoid;page-break-inside:avoid}
  .records :is(th,td){padding:4.15pt 5pt 4.15pt 0;vertical-align:top;text-align:left;overflow-wrap:anywhere}
  .records :is(th,td):last-child{padding-right:0}
  .records th{font-size:9pt;font-weight:700;color:var(--muted);border-bottom:1.15pt solid var(--ink);padding-top:2pt;padding-bottom:4.5pt}
  .records td{border-bottom:.5pt solid var(--rule)}
  .records tbody:last-child tr:last-child td{border-bottom:1.15pt solid var(--ink)}
  .records .right{text-align:right}.records .center{text-align:center}.records .strong{font-weight:700}
  .second-line{display:block;color:var(--muted);font-size:9pt;line-height:1.35}.second-line:not(:has(.value:not(:empty))){display:none}
  .table-totals td{border-top:.7pt solid #9a9c9e;font-weight:700}
  .summary{display:grid;grid-template-columns:1.03fr 1fr;gap:11pt;align-items:start;break-inside:avoid;margin:10pt 0}
  .scan-details{display:flex;gap:15pt;align-items:flex-start;min-width:0}
  .verification{display:flex;flex-direction:column;align-items:center;flex:none;color:var(--ink);text-decoration:none;font-size:9.2pt;font-weight:700;gap:3.5pt}
  .verification img{display:block;width:61pt;height:61pt;border:.65pt solid var(--rule);border-radius:5pt}
  .amount-words{padding-top:3pt;overflow-wrap:anywhere}.amount-words h2{margin-bottom:6pt}
  .total-line{display:flex;align-items:baseline;justify-content:space-between;gap:8pt;margin-bottom:4pt;color:var(--muted)}
  .total-line strong{color:var(--ink);font-weight:400;text-align:right}
  .total{display:flex;justify-content:space-between;align-items:center;gap:6pt;border-top:1.15pt solid var(--ink);padding-top:7pt}
  .total h2{color:var(--ink)}.total strong{font-size:15.5pt;line-height:1.13;color:var(--accent);text-align:right;overflow-wrap:anywhere}
  .total.filled,.balance{background:var(--accent);border:0;border-radius:8pt;color:var(--primary-text,#fff);padding:9pt 13pt}
  .total.filled h2,.balance h2{color:inherit}.total.filled strong{color:inherit;font-size:20pt}
  .balance{display:grid;grid-template-columns:auto auto auto auto 1fr;align-items:end;gap:12pt;margin-top:9pt;break-inside:avoid}
  .balance strong{display:block;margin-top:3pt;font-size:12pt}.balance div:last-child{text-align:right}.balance div:last-child strong{font-size:16pt}
  .footer{font-size:9.5pt;color:var(--muted);text-align:right}.footer strong{color:var(--ink)}
  .compact h1{font-size:21.5pt}.compact .records td{padding-top:9.5pt;padding-bottom:9.5pt}.compact .amount-words{padding-top:9pt}
  .report-summary{margin:7pt 0 12pt;min-height:0}.report-summary dl{grid-template-columns:repeat(4,minmax(0,1fr))}
  .report-summary:not(:has(.field)),.report-data td[data-visible=""],.report-data:not(:has(tr)),.report-data:has(tr) + .report-fallback{display:none}
  .section-title td{font-weight:700;background:var(--panel)}.section-columns td{font-weight:700;color:var(--muted);border-bottom:1.15pt solid var(--ink)}
  .section-title,.section-columns{break-after:avoid}
  @media screen{
    .sheet{max-width:${wide ? 297 : 210}mm;min-height:${compact ? 148 : wide ? 210 : 297}mm;padding:10.7mm ${inset}mm 11mm;margin:auto;display:flex;flex-direction:column}
    .footer{margin-top:auto;padding-top:16pt}
  }
  @media print{.footer{display:none}.sheet{width:100%}}
  `;
}

function document(title: string, reference: string, body: string, paper: Paper = 'A4', heading = title) {
  return `<!doctype html>${DOCUMENT_LAYOUT_MARKER}<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title><style>${pageStyles(paper)}</style></head><body>
    <main class="sheet${paper === 'A5 landscape' ? ' compact' : ''}">
      <header class="header"><div class="brand"><div class="brand-logo">{{companyInfo.initials}}</div><div class="brand-text">
        <strong>${bind('companyInfo.name', 'companyInfo.legalName')}</strong><div>{{companyInfo.address}}</div>
        <div><span class="phone">{{companyInfo.mobile}}</span><span class="support">{{companyInfo.supportPhone}}</span></div>
      </div></div><div class="heading"><h1>${heading}</h1><div class="document-number">${reference}</div></div></header>
      <div>${body}</div><footer class="footer optional">Prepared by: <strong>${bind('preparedBy', 'companyInfo.preparedBy', 'report.preparedBy')}</strong></footer>
    </main></body></html>`;
}

function transaction(title: string, path: 'invoice' | 'order' | 'purchaseOrder', purchase = false) {
  const isOrder = path !== 'invoice';
  const partyPath = `${path}.${purchase ? 'vendor' : 'customer'}`;
  const reference = bind(`${path}.${isOrder ? 'orderNumber' : 'invoiceNumber'}`, `${path}.invoice_no`);
  const amounts = [`${path}.total`, `${path}.totalAmount`, `${path}.calculatedGrandTotal`];
  const discounts = [`${path}.total_discount`, `${path}.totalDiscountAmount`, `${path}.discountAmount`];
  const fields = cards(
    party(purchase ? 'Vendor' : 'Bill to', value(`${path}.vendor_name`, `${partyPath}.name`), value(`${path}.vendor_address`, `${partyPath}.address`, `${path}.vendor_city`),
      value(`${path}.vendor_phone`, `${partyPath}.phone`)),
    details(isOrder ? 'Order details' : 'Invoice details',
      field(isOrder ? 'Order no.' : 'Invoice no.', reference),
      field(isOrder ? 'Order date' : 'Invoice date', date(`${path}.${isOrder ? 'orderDate' : 'invoiceDate'}`, `${path}.invoice_date`)),
      isOrder ? field('Status', value(`${path}.orderStatus`, `${path}.status`)) :
        field('Order no.', value(`${path}.order_no`, `${path}.${purchase ? 'purchaseOrder' : 'saleOrder'}.orderNumber`)),
      field('Currency', currency.replace('class="currency"', 'class="currency currency-detail"'))),
  );
  const records = table(`${path}.items`, [
    { label: 'ID', value: value('product_id', 'product.skuCode', 'skuCode', 'service.code', 'lineNumber'), width: '6%' },
    { label: 'Description', value: description(['product_name', 'productName', 'product.name', 'service.name', 'name'], ['specification', 'productFlavour.flavour.name', 'flavour']) },
    { label: 'Qty', value: `${quantity('quantity', 'qty')} ${value('measurement_unit', 'uom.name', 'uomString')}`, width: '11%', right: true },
    { label: 'Unit price', value: money('unit_price', purchase ? 'purchaseUnitPrice' : 'saleUnitPrice', 'rate'), width: '11%', right: true },
    { label: 'Disc. %', value: value('documentPercent.discountPercentage', 'discountPercentage'), width: '8.5%', right: true },
    { label: 'Discount', value: money('discount_amount', 'discountAmount'), width: '9%', right: true },
    { label: amountHeading, value: money('total', 'totalAmount', 'total_price'), width: '15%', right: true, strong: true },
  ], `<td></td><td>${value('documentTotals.itemCount')}</td><td class="right">${value('documentTotals.quantity')}</td><td></td><td></td>
      <td class="right">${money(...discounts)}</td><td class="right">${money(...amounts)}</td>`);

  const totals = totalLine('Total', money('documentTotals.subtotal', `${path}.orderTotal`, ...amounts)) +
    totalLine('Less discount', money(...discounts), true) +
    totalLine('Tax', value(`documentNonzeroAmount.${path}.total_tax`, `documentNonzeroAmount.${path}.taxAmount`, `documentNonzeroAmount.${path}.totalTaxAmount`), true) +
    totalLine('Delivery', value(`documentNonzeroAmount.${path}.delivery_cost`, `documentNonzeroAmount.${path}.deliveryCost`), true) +
    total('Total amount', money(...amounts), false);
  const balance = path === 'purchaseOrder' ? '' : `<section class="balance optional" aria-label="Account balance">
    <div><h2>Previous balance</h2><strong>${money(`${path}.previous_balance`)}</strong></div><b>+</b>
    <div><h2>This bill</h2><strong>${money(`${path}.this_bill`)}</strong></div><b>=</b>
    <div><h2>Current balance</h2><strong>${currency} ${money(`${path}.current_balance`)}</strong></div></section>`;
  return document(title, reference, fields + records + summary(words(...amounts), totals) + balance);
}

function voucher() {
  const fields = cards(
    party(value('voucherPartyLabel'), value('voucherPartyName', 'party.name'), value('voucherPartyAddress', 'party.address'), value('voucherPartyPhone', 'party.phone')),
    details('Voucher details', field('Voucher date', date('voucherDate')), field('Payment mode', value('paymentMethod')),
      field('Cheque no.', value('chequeNumber')), field('Bank', value('bankName'))),
  );
  const records = table('voucherRows', [
    { label: 'No.', value: value('lineNumber'), width: '6%' },
    { label: 'Particulars', value: value('particulars'), strong: true },
    { label: 'Reference', value: value('reference'), width: '24%' },
    { label: amountHeading, value: money('amount'), width: '16%', right: true, strong: true },
  ]);
  return document('Voucher', bind('voucherNumber'), fields + records + summary(words('amount'),
    total(value('voucherAmountLabel'), money('amount'))), 'A5 landscape', value('voucherDocumentLabel'));
}

function warehouseSlip() {
  const fields = cards(party('Party', value('slip.partyName'), value('slip.partyCode')),
    details('Slip details', field('Source', value('slip.documentTypeLabel')), field('Date', date('slip.documentDate')),
      field('Warehouse', value('slip.warehouseLabel')), field('Total quantity', quantity('slip.totalQuantity'))));
  const records = table('slip.items', [
    { label: 'SKU', value: value('skuCode'), width: '17%' },
    { label: 'Description', value: description(['productName'], ['flavour']) },
    { label: 'Unit', value: value('uom'), width: '14%' },
    { label: 'Quantity', value: quantity('quantity'), width: '14%', right: true, strong: true },
  ]);
  return document('Warehouse Slip', bind('slip.documentNumber'), fields + records +
    summary(value('slip.notes'), total('Total quantity', quantity('slip.totalQuantity'), true, false)));
}

function grn() {
  const fields = cards(party('Receiving', value('grn.vendorName', 'companyInfo.name')),
    details('Receiving details', field('Search', value('filters.search', 'search')), field('Status', value('filters.status'))));
  const records = table('rows', [
    { label: 'Date', value: date('date'), width: '13%' },
    { label: 'GRN no.', value: value('grnNumber'), width: '15%' },
    { label: 'Order no.', value: value('purchaseOrderNumber', 'purchaseOrder'), width: '14%' },
    { label: 'Vendor', value: value('vendorName', 'vendor') },
    { label: 'Warehouse', value: value('warehouseName', 'warehouse'), width: '16%' },
    { label: 'Status', value: value('status'), width: '12%' },
    { label: amountHeading, value: money('totalAmount'), width: '15%', right: true, strong: true },
  ]);
  return document('Goods Received Notes', bind('grn.grnNumber'), fields + records + summary());
}

function payslip() {
  const fields = cards(
    party('Employee', value('paySlip.employeeName', 'paySlip.employee.fullName', 'employee.fullName'), value('paySlip.employeeCode', 'paySlip.employee.employeeCode', 'employee.employeeCode')),
    details('Payslip details', field('Pay period', value('paySlip.payPeriod', 'payPeriod')), field('Payment date', date('paySlip.paymentDate')),
      field('Status', value('paySlip.status')), field('Currency', value('paySlip.currency', 'companyInfo.currency'))),
  );
  const records = table('paySlip.lines', [
    { label: 'Code', value: value('componentCode', 'salaryComponent.code'), width: '14%' },
    { label: 'Description', value: value('componentName', 'salaryComponent.name'), strong: true },
    { label: 'Type', value: value('typeLabel', 'componentType'), width: '19%' },
    { label: amountHeading, value: money('calculatedAmount'), width: '20%', right: true, strong: true },
  ]);
  return document('Payslip', bind('paySlip.paySlipNumber', 'paySlip.payslipNumber', 'payslipNumber'), fields + records +
    summary(words('paySlip.netSalary', 'netPay'), totalLine('Gross pay', money('paySlip.grossSalary', 'grossPay')) +
      totalLine('Deductions', money('paySlip.totalDeductions', 'totalDeductions')) + total('Net pay', money('paySlip.netSalary', 'netPay'))));
}

function generalLedger() {
  const fields = cards(
    party('Account', value('ledger.account.name', 'ledger.account_name', 'account.name'), value('ledger.account.code', 'ledger.account_id', 'account.code')),
    details('Ledger details', field('From', date('ledger.period.startDate', 'dateFrom')), field('To', date('ledger.period.endDate', 'dateTo')),
      field('Opening balance', money('ledger.openingBalance', 'ledger.opening_balance', 'openingBalance'))),
  );
  const records = table('entries', [
    { label: 'Date', value: date('transactionDate', 'date'), width: '14%' },
    { label: 'Reference', value: value('reference', 'referenceNo', 'voucher_no', 'referenceType'), width: '16%' },
    { label: 'Description', value: value('description', 'narration') },
    { label: 'Debit', value: money('debitAmount', 'debit'), width: '14%', right: true },
    { label: 'Credit', value: money('creditAmount', 'credit'), width: '14%', right: true },
    { label: 'Balance', value: money('runningBalance', 'balance', 'currentBalance'), width: '16%', right: true, strong: true },
  ]);
  return document('General Ledger', bind('ledger.account.code', 'ledger.account_id'), fields + records +
    summary('', totalLine('Total debit', money('ledger.totalDebit', 'ledger.totals.periodDebit', 'totalDebit'), true) +
      totalLine('Total credit', money('ledger.totalCredit', 'ledger.totals.periodCredit', 'totalCredit'), true) +
      total('Closing balance', money('ledger.closingBalance', 'closingBalance'))));
}

function accountsList() {
  const fields = cards(party('Accounts', value('category', 'companyInfo.name')),
    details('List details', field('Account type', value('category')), field('Search', value('search'))));
  const records = table('rows', [
    { label: 'No.', value: value('serial', 'lineNumber'), width: '9%' },
    { label: 'Account code', value: value('code', 'account_code'), width: '21%' },
    { label: 'Account name', value: value('name', 'account_name', 'label'), strong: true },
    { label: 'Opening balance', value: money('openingBalance', 'opening_balance'), width: '23%', right: true, strong: true },
  ]);
  return document('Accounts List', '', fields + records + summary());
}

function report(isPartyLedger: boolean) {
  const title = isPartyLedger ? 'Party Ledger' : 'Report';
  const fields = cards(party(title, value('filters.partyName', 'report.title', 'reportTitle')),
    details('Report details', `{{#each documentReportFilters}}${field('{{label}}', value('value'), true)}{{/each}}`,
      field('From', date('filters.startDate', 'report.period.startDate'), true),
      field('To', date('filters.endDate', 'report.period.endDate'), true)));
  const fallback = isPartyLedger ? [
    { label: 'Code', value: value('code'), width: '13%' },
    { label: 'Party', value: value('name'), strong: true },
    { label: 'Opening balance', value: money('openingBalance'), width: '16%', right: true },
    { label: 'Debit', value: money('periodDebit'), width: '14%', right: true },
    { label: 'Credit', value: money('periodCredit'), width: '14%', right: true },
    { label: 'Closing balance', value: money('closingBalance'), width: '16%', right: true, strong: true },
  ] : [
    { label: 'Reference', value: value('code', 'skuCode', 'voucherNumber', 'accountCode', 'serial', 'lineNumber'), width: '16%' },
    { label: 'Description', value: value('label', 'name', 'productName', 'partyName', 'customerName', 'vendorName', 'fullName', 'accountName', 'description', 'brandName'), strong: true },
    { label: 'Date / Qty', value: value('date', 'voucherDate', 'quantity', 'totalQuantity', 'stockQuantity'), width: '16%', right: true },
    { label: 'Amount / Balance', value: money('totalAmount', 'currentBalance', 'closingBalance', 'voucher_amount', 'amount', 'value'), width: '18%', right: true, strong: true },
  ];
  const cells = Array.from({ length: 16 }, (_, index) => {
    const column = `c${index}`;
    return `<td class="{{${column}.align}}" colspan="{{${column}.span}}" data-visible="{{${column}.present}}" style="width:{{${column}.width}}">{{${column}.text}}</td>`;
  }).join('');
  const records = `<table class="records report-data"><tbody>{{#each documentReportRows}}<tr class="{{rowClass}}">${cells}</tr>{{/each}}</tbody></table>
    <div class="report-fallback">${table('rows', fallback)}</div>`;
  const totals = `<section class="report-summary card"><dl>{{#each documentReportSummary}}${field('{{label}}', value('value'))}{{/each}}</dl></section>`;
  const heading = `${bind('report.title', 'reportTitle')}<span class="value">${title}</span>`;
  return document(title, '', fields + records + totals + summary(), 'A4 landscape', heading);
}

const documentDefinitions = {
  [Type.SALE_INVOICE]: ['Sale Invoice', () => transaction('Sale Invoice', 'invoice')],
  [Type.PURCHASE_INVOICE]: ['Purchase Invoice', () => transaction('Purchase Invoice', 'invoice', true)],
  [Type.SALE_ORDER]: ['Sale Order', () => transaction('Sale Order', 'order')],
  [Type.PURCHASE_ORDER]: ['Purchase Order', () => transaction('Purchase Order', 'purchaseOrder', true)],
  [Type.WAREHOUSE_SLIP]: ['Warehouse Slip', warehouseSlip],
  [Type.GRN]: ['GRN', grn],
  [Type.PAYSLIP]: ['Payslip', payslip],
  [Type.PARTY_LEDGER]: ['Party Ledger', () => report(true)],
  [Type.GENERAL_LEDGER]: ['General Ledger', generalLedger],
  [Type.ACCOUNTS_LIST]: ['Accounts List', accountsList],
  [Type.VOUCHER]: ['Voucher', voucher],
  [Type.REPORT]: ['Report', () => report(false)],
} satisfies Record<Type, [name: string, layout: () => string]>;

export function buildDefaultDocumentLayouts(verificationMarkup: string) {
  return Object.values(Type).map((documentType) => {
    const [name, layout] = documentDefinitions[documentType];
    return { documentType, name, content: layout().replace('%%verification%%', () => verificationMarkup) };
  });
}
