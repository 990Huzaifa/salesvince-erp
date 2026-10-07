import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import {
  formatDocumentDate,
  formatPakistaniNumber,
  PdfLogoService,
  PdfRendererService,
  safePdfFilenamePart,
} from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import { ReportService } from '../report.service';
import { ReportFinancialTransactionService } from './report-financial-transaction.service';
import { ReportReceivablePayableService } from './report-receivable-payable.service';
import { ReportReceivingService } from './report-receiving.service';
import {
  buildReportPdfHtml,
  formatReportDateRange,
  type ReportPdfColumn,
  type ReportPdfDocument,
} from './report-pdf.template';
import { PrintThemeService } from '../print-theme.service';

type SummaryQuery = { startDate?: string; endDate?: string; partyId?: string; cityId?: string };
type LedgerQuery = { startDate?: string; endDate?: string; customerId?: string; vendorId?: string };
type FinancialReportQuery = { startDate?: string; endDate?: string; customerId?: string };
type ReportDocumentInput = Omit<ReportPdfDocument, 'business' | 'logoDataUri' | 'preparedBy'>;

const money = (value: unknown): string => formatPakistaniNumber(value);
const dateFilterLabel = (startDate?: string, endDate?: string): string => startDate || endDate ? 'Custom Range' : 'All Time';
const asRows = <T extends object>(rows: T[]): Record<string, unknown>[] => rows.map((row) => ({ ...row }) as Record<string, unknown>);

@Injectable()
export class ReportPdfService {
  constructor(
    private readonly reportService: ReportService,
    private readonly reportFinancialTransactionService: ReportFinancialTransactionService,
    private readonly reportReceivablePayableService: ReportReceivablePayableService,
    private readonly reportReceivingService: ReportReceivingService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
    private readonly printThemeService: PrintThemeService,
  ) {}

  async generateCustomerBalancesPdf(db: DataSource, businessId: string, actorUserId: string, tenantId?: string) {
    const data = await this.reportService.getCustomerBalances(db, businessId, actorUserId);
    const rows = data.data.map((row, index) => ({ serial: index + 1, ...row }));
    const columns: ReportPdfColumn[] = [
      { key: 'serial', label: 'S No.', width: '8%', align: 'center' },
      { key: 'code', label: 'Code', width: '10%', align: 'center' },
      { key: 'name', label: 'Name', width: '42%' },
      { key: 'openingBalance', label: 'Opening Balance', width: '14%', align: 'right', format: 'amount' },
      { key: 'currentBalance', label: 'Current Balance', width: '16%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Customer Balance Report',
      filters: [{ label: 'Report', value: 'Customer Balance' }],
      summary: [{ label: 'Total Customers', value: data.meta.total }, { label: 'Current Receivable', value: money(data.totals.currentBalance) }],
      sections: [{ columns, rows: asRows(rows), emptyMessage: 'No customer balances found' }], minimumRows: 12,
    }, 'Customer-Balance-Report', tenantId);
  }

  async generateVendorBalancesPdf(db: DataSource, businessId: string, actorUserId: string, tenantId?: string) {
    const data = await this.reportService.getVendorBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'serial', label: 'S No.', width: '8%', align: 'center' },
      { key: 'code', label: 'Code', width: '10%', align: 'center' },
      { key: 'name', label: 'Name', width: '42%' },
      { key: 'openingBalance', label: 'Opening Balance', width: '14%', align: 'right', format: 'amount' },
      { key: 'currentBalance', label: 'Current Balance', width: '16%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Vendor Balance Report',
      filters: [{ label: 'Report', value: 'Vendor Balance' }],
      summary: [{ label: 'Total Vendors', value: data.meta.total }, { label: 'Current Payable', value: money(data.totals.currentBalance) }],
      sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No vendor balances found' }], minimumRows: 12,
    }, 'Vendor-Balance-Report', tenantId);
  }

  async generateCashBankBalancesPdf(db: DataSource, businessId: string, actorUserId: string, tenantId?: string) {
    const data = await this.reportService.getCashAndBankBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'accountName', label: 'Account Name', width: '34%' }, { key: 'accountCode', label: 'Account Code', width: '18%', align: 'center' }, { key: 'accountType', label: 'Type', width: '14%', align: 'center' }, { key: 'openingBalance', label: 'Opening Balance', width: '17%', align: 'right', format: 'amount' }, { key: 'currentBalance', label: 'Current Balance', width: '17%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Cash & Bank Balance',
      filters: [{ label: 'Report', value: 'Cash & Bank' }],
      summary: [{ label: 'Cash Balance', value: money(data.totals.cash) }, { label: 'Bank Balance', value: money(data.totals.bank) }, { label: 'Total Accounts', value: data.meta.total }],
      sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No cash & bank balances found' }], minimumRows: 12,
    }, 'Cash-Bank-Balance-Report', tenantId);
  }

  async generateEmployeeBalancesPdf(db: DataSource, businessId: string, actorUserId: string, tenantId?: string) {
    const data = await this.reportService.getEmployeeBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'employeeCode', label: 'Employee Code', width: '10%' }, { key: 'fullName', label: 'Full Name', width: '14%' }, { key: 'departmentName', label: 'Department', width: '11%' }, { key: 'designationName', label: 'Designation', width: '11%' }, { key: 'employeeStatus', label: 'Status', width: '8%', align: 'center' }, { key: 'accId', label: 'Account ID', width: '12%' }, { key: 'accountCode', label: 'Account Code', width: '10%' }, { key: 'openingBalance', label: 'Opening Balance', width: '10%', align: 'right', format: 'amount' }, { key: 'currentBalance', label: 'Current Balance', width: '10%', align: 'right', format: 'amount' }, { key: 'balanceType', label: 'Balance Type', width: '9%' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Employee Balance',
      filters: [{ label: 'Report', value: 'Employee Balance' }],
      summary: [{ label: 'Current Balance', value: money(data.totals.currentBalance) }, { label: 'Total Employees', value: data.meta.total }],
      sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No employee balances found' }], minimumRows: 12,
    }, 'Employee-Balance-Report', tenantId);
  }

  async generateFinancialReportPdf(db: DataSource, businessId: string, actorUserId: string, query: FinancialReportQuery, tenantId?: string) {
    const financial = await this.reportFinancialTransactionService.getFinancialReport(
      db,
      businessId,
      { startDate: query.startDate, endDate: query.endDate, allRows: true },
      actorUserId,
    );
    const allRows = { recordActivity: false };
    const [cashBank, vendors, customers, employees, customer, partySales] = await Promise.all([
      this.reportService.getCashAndBankBalances(db, businessId, actorUserId, allRows),
      this.reportService.getVendorBalances(db, businessId, actorUserId, allRows),
      this.reportService.getCustomerBalances(db, businessId, actorUserId, allRows),
      this.reportService.getEmployeeBalances(db, businessId, actorUserId, allRows),
      query.customerId
        ? db.getRepository(Party).findOne({ where: { id: query.customerId, businessId, deletedAt: IsNull() } })
        : Promise.resolve(null),
      query.customerId
        ? this.reportReceivingService.getReceivingReport(
            db,
            businessId,
            { startDate: query.startDate, endDate: query.endDate, partyId: query.customerId, allRows: true, recordActivity: false },
            actorUserId,
          )
        : Promise.resolve(null),
    ]);
    const transactionColumns: ReportPdfColumn[] = [
      { key: 'date', label: 'Transaction Date', width: '15%' },
      { key: 'description', label: 'Description', width: '37%' },
      { key: 'debit', label: 'Debit', width: '12%', align: 'right', format: 'amount' },
      { key: 'credit', label: 'Credit', width: '12%', align: 'right', format: 'amount' },
      { key: 'currentBalance', label: 'Balance', width: '14%', align: 'right', format: 'amount' },
      { key: 'referenceId', label: 'Voucher', width: '10%' },
    ];
    const balanceColumns: ReportPdfColumn[] = [
      { key: 'serial', label: 'S No.', width: '8%', align: 'center' },
      { key: 'code', label: 'Code', width: '12%' },
      { key: 'name', label: 'Name', width: '34%' },
      { key: 'openingBalance', label: 'Opening Balance', width: '22%', align: 'right', format: 'amount' },
      { key: 'currentBalance', label: 'Current Balance', width: '24%', align: 'right', format: 'amount' },
    ];
    const financialRows = (rows: Array<Record<string, unknown>>) => rows.map((row) => ({
      ...row,
      date: formatDocumentDate(row.transactionDate as string | Date | null),
    }));
    const sections: ReportPdfDocument['sections'] = [
      { title: 'Purchases', columns: transactionColumns, rows: financialRows(financial.purchases.data as unknown as Array<Record<string, unknown>>) },
      { title: 'Sales', columns: transactionColumns, rows: financialRows(financial.sales.data as unknown as Array<Record<string, unknown>>) },
      { title: 'Expenses', columns: transactionColumns, rows: financialRows(financial.expenses.data as unknown as Array<Record<string, unknown>>) },
      { title: 'Income', columns: transactionColumns, rows: financialRows(financial.income.data as unknown as Array<Record<string, unknown>>) },
      { title: 'Cash & Bank Balance', columns: [
        { key: 'accountName', label: 'Account Name', width: '34%' },
        { key: 'accountCode', label: 'Account Code', width: '18%' },
        { key: 'accountType', label: 'Type', width: '14%' },
        { key: 'openingBalance', label: 'Opening Balance', width: '17%', align: 'right', format: 'amount' as const },
        { key: 'currentBalance', label: 'Current Balance', width: '17%', align: 'right', format: 'amount' as const },
      ], rows: asRows(cashBank.data) },
      { title: 'Vendor Balance', columns: balanceColumns, rows: asRows(vendors.data.map((row, index) => ({ serial: index + 1, ...row }))) },
      { title: 'Customer Balance', columns: balanceColumns, rows: asRows(customers.data.map((row, index) => ({ serial: index + 1, ...row }))) },
      { title: 'Employee Balance', columns: [
        { key: 'employeeCode', label: 'Employee Code', width: '13%' },
        { key: 'fullName', label: 'Full Name', width: '22%' },
        { key: 'departmentName', label: 'Department', width: '16%' },
        { key: 'designationName', label: 'Designation', width: '16%' },
        { key: 'openingBalance', label: 'Opening Balance', width: '16%', align: 'right', format: 'amount' as const },
        { key: 'currentBalance', label: 'Current Balance', width: '17%', align: 'right', format: 'amount' as const },
      ], rows: asRows(employees.data) },
      ...(partySales ? [{ title: 'Party Sales Summary', columns: [
        { key: 'voucherNumber', label: 'Voucher Code', width: '25%' },
        { key: 'paymentMethod', label: 'Payment Method', width: '25%' },
        { key: 'paymentAmount', label: 'Voucher Amount', width: '25%', align: 'right' as const, format: 'amount' as const },
        { key: 'paymentDate', label: 'Voucher Date', width: '25%' },
      ], rows: asRows(partySales.data.map((row) => ({ ...row, paymentDate: formatDocumentDate(row.paymentDate) }))) }] : []),
    ];
    const customerName = customer?.name;

    return this.render(db, businessId, actorUserId, {
      layout: 'balance',
      title: 'Financial Report',
      filters: [
        { label: 'Period', value: formatReportDateRange(query.startDate, query.endDate) },
        { label: 'Customer', value: customerName },
      ],
      summary: [
        { label: 'Net Profit', value: money(financial.netProfit) },
        { label: 'Purchases', value: money(financial.purchases.total) },
        { label: 'Sales', value: money(financial.sales.total) },
        { label: 'Expenses', value: money(financial.expenses.total) },
        { label: 'Income', value: money(financial.income.total) },
      ],
      sections,
    }, 'Financial-Report', tenantId);
  }

  async generateReceivingReportPdf(db: DataSource, businessId: string, actorUserId: string, query: { startDate?: string; endDate?: string; partyId?: string }, tenantId?: string) {
    const data = await this.reportReceivingService.getReceivingReport(
      db,
      businessId,
      { startDate: query.startDate, endDate: query.endDate, partyId: query.partyId, allRows: true },
      actorUserId,
    );
    const columns: ReportPdfColumn[] = [
      { key: 'voucherNumber', label: 'Voucher #', width: '9%' },
      { key: 'partyCode', label: 'Code', width: '8%' },
      { key: 'partyName', label: 'Customer', width: '13%' },
      { key: 'paymentDate', label: 'Payment Date', width: '8%' },
      { key: 'paymentAmount', label: 'Amount', width: '9%', align: 'right', format: 'amount' },
      { key: 'paymentMethod', label: 'Method', width: '8%' },
      { key: 'chequeNumber', label: 'Cheque #', width: '8%' },
      { key: 'chequeDate', label: 'Cheque Date', width: '8%' },
      { key: 'accountName', label: 'Account', width: '9%' },
      { key: 'remarks', label: 'Remarks', width: '20%' },
    ];
    const rows = data.data.map((row, index) => ({
      serial: index + 1,
      ...row,
      paymentDate: formatDocumentDate(row.paymentDate),
      chequeDate: row.chequeDate ? formatDocumentDate(row.chequeDate) : '-',
    }));
    return this.render(db, businessId, actorUserId, {
      layout: 'balance',
      title: 'Receiving Report',
      filters: [
        { label: 'Date Filter', value: dateFilterLabel(query.startDate, query.endDate) },
        { label: 'Period', value: formatReportDateRange(data.period.startDate, data.period.endDate) },
        { label: 'Customer', value: rows[0]?.partyName },
      ],
      summary: [
        { label: 'Voucher Count', value: data.totals.voucherCount },
        { label: 'Total Amount', value: money(data.totals.totalAmount) },
      ],
      sections: [{ columns, rows: asRows(rows), emptyMessage: 'No receiving vouchers found' }],
    }, 'Receiving-Report', tenantId);
  }

  async generatePartyLedgerPdf(db: DataSource, businessId: string, actorUserId: string, variant: 'receivable' | 'payable', query: LedgerQuery, tenantId?: string) {
    const partyId = variant === 'receivable' ? query.customerId : query.vendorId;
    const options = { startDate: query.startDate, endDate: query.endDate, partyId, allRows: true };
    const data = variant === 'receivable'
      ? await this.reportReceivablePayableService.getReceivableReport(db, businessId, options, actorUserId)
      : await this.reportReceivablePayableService.getPayableReport(db, businessId, options, actorUserId);
    const title = variant === 'receivable' ? 'Receivable Report' : 'Payable Report';
    const partyName = partyId ? data.data.find((row) => row.id === partyId)?.name : undefined;
    const filters = [{ label: 'Date Filter', value: dateFilterLabel(query.startDate, query.endDate) }, { label: 'Period', value: formatReportDateRange(data.period.startDate, data.period.endDate) }, { label: variant === 'receivable' ? 'Customer' : 'Vendor', value: partyName }];
    const columns: ReportPdfColumn[] = [{ key: 'serial', label: 'S No.', width: '8%', align: 'center' }, { key: 'code', label: 'Code', width: '10%' }, { key: 'name', label: 'Name', width: '26%' }, { key: 'openingBalance', label: 'Opening', width: '14%', align: 'right', format: 'amount' }, { key: 'periodDebit', label: 'Debit', width: '14%', align: 'right', format: 'amount' }, { key: 'periodCredit', label: 'Credit', width: '14%', align: 'right', format: 'amount' }, { key: 'closingBalance', label: 'Closing', width: '14%', align: 'right', format: 'amount' }];
    return this.render(db, businessId, actorUserId, { layout: 'party-ledger', title, filters, summary: [{ label: 'Opening Balance', value: money(data.totals.openingBalance) }, { label: 'Period Debit', value: money(data.totals.periodDebit) }, { label: 'Period Credit', value: money(data.totals.periodCredit) }, { label: 'Closing Balance', value: money(data.totals.closingBalance) }], sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No party ledger records found.' }], footerRight: `Party Count: ${data.meta.total}` }, `${variant === 'receivable' ? 'Receivable' : 'Payable'}-Report`, tenantId);
  }

  async generateSummaryPdf(db: DataSource, businessId: string, actorUserId: string, variant: 'sales' | 'purchase', query: SummaryQuery, tenantId?: string) {
    const data = variant === 'sales'
      ? await this.reportService.getSalesSummaryReport(db, businessId, { ...query }, actorUserId)
      : await this.reportService.getPurchaseSummaryReport(db, businessId, { ...query }, actorUserId);
    const sales = variant === 'sales';
    const partyLabel = sales ? 'Party' : 'Vendor';
    const partyColumns: ReportPdfColumn[] = [{ key: 'partyCode', label: `${partyLabel} Code`, width: '14%' }, { key: 'partyName', label: `${partyLabel} Name`, width: '24%' }, { key: 'cityName', label: 'City', width: '15%' }, { key: 'invoiceCount', label: 'Invoices', width: '9%', align: 'center' }, { key: 'totalAmount', label: 'Amount', width: '14%', align: 'right', format: 'amount' }, { key: 'totalTaxAmount', label: 'Tax', width: '12%', align: 'right', format: 'amount' }, { key: 'totalDiscountAmount', label: 'Discount', width: '12%', align: 'right', format: 'amount' }];
    const cityColumns: ReportPdfColumn[] = [{ key: 'cityName', label: 'City', width: '28%' }, { key: 'invoiceCount', label: 'Invoices', width: '12%', align: 'center' }, { key: 'totalAmount', label: 'Amount', width: '20%', align: 'right', format: 'amount' }, { key: 'totalTaxAmount', label: 'Tax', width: '20%', align: 'right', format: 'amount' }, { key: 'totalDiscountAmount', label: 'Discount', width: '20%', align: 'right', format: 'amount' }];
    const partyRows = data.partyWise || [];
    const filteredParty = query.partyId ? partyRows.find((row) => row.partyId === query.partyId) : undefined;
    const filteredCity = query.cityId ? (data.cityWise || []).find((row) => row.cityId === query.cityId) : undefined;
    return this.render(db, businessId, actorUserId, { layout: 'summary', title: sales ? 'Sales Summary' : 'Purchase Summary', filters: [{ label: 'Date Filter', value: dateFilterLabel(query.startDate, query.endDate) }, { label: 'Period', value: formatReportDateRange(data.period.startDate, data.period.endDate) }, { label: sales ? 'Customer' : 'Vendor', value: filteredParty?.partyName }, { label: 'City', value: filteredCity?.cityName }, { label: 'Scope', value: data.filters.scope || 'ALL' }], summary: [{ label: 'Invoices', value: data.totals.invoiceCount }, { label: 'Total Amount', value: money(data.totals.totalAmount) }, { label: 'Tax Amount', value: money(data.totals.totalTaxAmount) }, { label: 'Discount Amount', value: money(data.totals.totalDiscountAmount) }], sections: [{ title: `${partyLabel} Wise Summary`, columns: partyColumns, rows: asRows(partyRows), emptyMessage: `No ${partyLabel.toLowerCase()} wise summary found.` }, { title: 'City Wise Summary', columns: cityColumns, rows: asRows(data.cityWise || []), emptyMessage: 'No city wise summary found.' }], footerRight: `${partyLabel} Count: ${data.meta.partyCount} | City Count: ${data.meta.cityCount}` }, `${sales ? 'Sales' : 'Purchase'}-Summary`, tenantId);
  }

  private async render(db: DataSource, businessId: string, actorUserId: string, input: ReportDocumentInput, filename: string, tenantId?: string) {
    const [business, actor, theme] = await Promise.all([
      db.getRepository(Business).findOne({ where: { id: businessId } }),
      db.getRepository(User).findOne({ where: { id: actorUserId }, select: { id: true, name: true } }),
      this.printThemeService.resolveForTenant(tenantId),
    ]);
    if (!business) throw new NotFoundException('Business not found');
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const document: ReportPdfDocument = {
      ...input,
      logoDataUri,
      business: { name: business.name, legalName: business.legalName, address: business.address, phone: business.phone, currency: business.currency },
      preparedBy: actor?.name || 'Admin',
    };
    const buffer = await this.pdfRendererService.renderHtmlToPdf({ html: buildReportPdfHtml(document, new Date(), theme), enforceSinglePage: false });
    return { buffer, filename: `${safePdfFilenamePart(filename)}.pdf` };
  }
}
