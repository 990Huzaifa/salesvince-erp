import { formatPakistaniNumber } from 'src/common/pdf';
import { escapeHtml } from 'src/common/pdf';
import type { BusinessPdfContext } from 'src/common/pdf';

type PayslipPdfDocument = {
  payslipNumber: string;
  periodLabel: string;
  payslipDate: string;
  paymentDate: string;
  currency: string;
  status: string;
  isApproved: boolean;
  employeeName: string;
  employeeCode: string;
  basicSalary: number;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  lines: Array<{
    componentName: string;
    componentCode: string;
    componentType: string;
    calculationType: string;
    value: number;
    calculatedAmount: number;
    isEarning: boolean;
    isDeduction: boolean;
  }>;
  business: BusinessPdfContext;
};

const text = (value: unknown): string =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  typeof value === 'bigint'
    ? escapeHtml(String(value))
    : '';
const money = (value: unknown): string =>
  escapeHtml(formatPakistaniNumber(value));

export const buildPayslipPdfHtml = (
  payslip: PayslipPdfDocument,
  logoDataUri?: string | null,
): string => {
  const lineRows = payslip.lines.length
    ? payslip.lines
        .map(
          (line, index) => `<tr>
      <td class="center">${index + 1}</td><td>${text(line.componentName)}</td><td>${text(line.componentCode)}</td>
      <td><span class="badge ${line.isEarning ? 'earning' : line.isDeduction ? 'deduction' : ''}">${text(line.componentType)}</span></td>
      <td>${text(line.calculationType)}</td><td class="number">${money(line.value)}</td><td class="number strong">${money(line.calculatedAmount)}</td>
    </tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="empty">No line items found for this pay slip.</td></tr>';
  const totalRow = payslip.lines.length
    ? `<tfoot><tr><td colspan="6" class="number">Total</td><td class="number total-value">${money(payslip.netSalary)}</td></tr></tfoot>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Employee Payslip ${text(payslip.payslipNumber)}</title><style>
    :root { --primary:#9786ee; --primary-text:#fff; --foreground:#17182a; --muted:#667085; --border:#e5e8f0; --surface:#fff; --light-bg:#f5f6fb; --success:#16a34a; --destructive:#dc2626; }
    @page { size:A4 portrait; margin:8mm; } * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    html,body { margin:0; padding:0; background:var(--light-bg); font-family:Inter,Arial,sans-serif; color:var(--foreground); } body { width:194mm; }
    .pdf-content { width:194mm; margin:0 auto; padding:0; } .card { background:var(--surface); border-radius:16px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .company-header { display:flex; align-items:center; gap:12px; padding-bottom:20px; margin-bottom:24px; border-bottom:1px solid var(--border); }
    .company-header img { width:40px; height:40px; object-fit:contain; border-radius:8px; } .company-header h2 { margin:0; font-size:18px; }
    .title-row { display:flex; justify-content:space-between; gap:24px; margin-bottom:24px; } .title-row h1 { margin:0; font-size:28px; }
    .period { margin-top:12px; font-size:14px; font-weight:600; color:var(--primary); } .meta { border-left:1px dotted var(--border); padding-left:24px; font-size:14px; }
    .meta-item { margin-bottom:12px; } .meta-label { font-size:12px; color:var(--muted); } .meta-value { font-weight:700; }
    .employee-card { border:1px solid var(--border); border-radius:16px; background:var(--light-bg); padding:20px; margin-bottom:24px; }
    .employee-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; } .field-label { font-size:12px; color:var(--muted); } .field-value { font-weight:700; margin-bottom:12px; }
    .status { display:inline-block; border-radius:999px; padding:4px 12px; font-size:12px; font-weight:600; } .status.approved { background:#dcfce7; color:var(--success); } .status.pending { background:#f3f4f6; color:var(--muted); }
    .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; } .summary-card { border-radius:16px; padding:16px; border:1px solid var(--border); background:var(--surface); }
    .summary-card.net { background:linear-gradient(135deg,var(--primary) 0%,#14b8a6 100%); color:#fff; border:none; } .summary-label { font-size:14px; color:var(--muted); }
    .summary-card.net .summary-label,.summary-card.net .summary-currency { color:rgba(255,255,255,.8); } .summary-amount { font-size:20px; font-weight:700; margin-top:4px; }
    .summary-card.net .summary-amount { color:#fff; } .summary-currency { font-size:12px; color:var(--muted); margin-top:2px; }
    .table-wrap { border:1px solid var(--border); border-radius:16px; overflow:hidden; margin-bottom:24px; } .table-title { padding:12px 16px; border-bottom:1px solid var(--border); background:var(--light-bg); font-weight:600; }
    table { width:100%; border-collapse:collapse; } th { padding:12px 16px; text-align:left; background:var(--light-bg); font-size:11px; text-transform:uppercase; color:var(--primary); }
    td { padding:12px 16px; border-top:1px solid var(--border); font-size:14px; } .center { text-align:center; } .number { text-align:right; } .strong { font-weight:600; }
    .badge { display:inline-block; border-radius:999px; padding:2px 10px; font-size:11px; font-weight:600; } .badge.earning { background:#dcfce7; color:var(--success); } .badge.deduction { background:#fee2e2; color:var(--destructive); }
    .empty { text-align:center; color:var(--muted); padding:32px 16px; } tfoot td { background:var(--light-bg); font-weight:700; } .total-value { color:var(--success); }
    .disclaimer { border-radius:12px; background:var(--light-bg); padding:12px 16px; text-align:center; font-size:12px; color:var(--muted); }
  </style></head><body><main class="pdf-content"><div class="card">
    <div class="company-header">${logoDataUri ? `<img src="${text(logoDataUri)}" alt="Logo" />` : ''}<h2>${text(payslip.business.name || 'ERP By SalesVince')}</h2></div>
    <div class="title-row"><div><h1>Employee Payslip</h1><div class="period">${text(payslip.periodLabel)}</div></div><div class="meta">
      <div class="meta-item"><div class="meta-label">Payslip No.</div><div class="meta-value">${text(payslip.payslipNumber)}</div></div>
      <div class="meta-item"><div class="meta-label">Payslip Date</div><div class="meta-value">${text(payslip.payslipDate)}</div></div>
    </div></div>
    <div class="employee-card"><div class="employee-grid"><div><div class="field-label">Employee</div><div class="field-value">${text(payslip.employeeName)}</div><div class="field-label">Employee Code</div><div class="field-value">${text(payslip.employeeCode)}</div><div class="field-label">Payment Date</div><div class="field-value">${text(payslip.paymentDate)}</div></div><div><div class="field-label">Period</div><div class="field-value">${text(payslip.periodLabel)}</div><div class="field-label">Currency</div><div class="field-value">${text(payslip.currency)}</div><div class="field-label">Status</div><div class="field-value"><span class="status ${payslip.isApproved ? 'approved' : 'pending'}">${text(payslip.status)}</span></div></div></div></div>
    <div class="summary-grid"><div class="summary-card"><div class="summary-label">Basic Salary</div><div class="summary-amount">${money(payslip.basicSalary)}</div><div class="summary-currency">${text(payslip.currency)}</div></div><div class="summary-card"><div class="summary-label">Gross Salary</div><div class="summary-amount" style="color:var(--success)">${money(payslip.grossSalary)}</div><div class="summary-currency">${text(payslip.currency)}</div></div><div class="summary-card"><div class="summary-label">Total Deductions</div><div class="summary-amount" style="color:var(--destructive)">${money(payslip.totalDeductions)}</div><div class="summary-currency">${text(payslip.currency)}</div></div><div class="summary-card net"><div class="summary-label">Net Salary</div><div class="summary-amount">${money(payslip.netSalary)}</div><div class="summary-currency">${text(payslip.currency)}</div></div></div>
    <div class="table-wrap"><div class="table-title">Earnings &amp; Deductions</div><table><thead><tr><th class="center">#</th><th>Component</th><th>Code</th><th>Type</th><th>Calculation</th><th class="number">Value</th><th class="number">Amount</th></tr></thead><tbody>${lineRows}</tbody>${totalRow}</table></div>
    <div class="disclaimer">This is a system generated payslip and does not require signature.</div>
  </div></main></body></html>`;
};
