import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Business } from 'src/tenant-db/entities/business.entity';
import { PdfLogoService, PdfRendererService, safePdfFilenamePart } from 'src/common/pdf';
import { ReportService } from '../report.service';
import { ReportReceivablePayableService } from './report-receivable-payable.service';
import { buildReportPdfHtml, type ReportPdfColumn, type ReportPdfDocument, type ReportPdfSection } from './report-pdf.template';

type SummaryQuery = { startDate?: string; endDate?: string; partyId?: string; cityId?: string };
type LedgerQuery = { startDate?: string; endDate?: string; customerId?: string; vendorId?: string };

const money = (value: unknown): string => formatNumber(value);
const formatNumber = (value: unknown): string => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number) : '0.00';
};

const balanceColumns: ReportPdfColumn[] = [
  { key: 'code', label: 'Code', width: '12%' },
  { key: 'name', label: 'Name', width: '28%' },
  { key: 'accountCode', label: 'Account Code', width: '14%' },
  { key: 'address', label: 'Address', width: '22%' },
  { key: 'partyType', label: 'Party Type', width: '12%', align: 'center' },
  { key: 'openingBalance', label: 'Opening Balance', width: '12%', align: 'right', format: 'amount' },
  { key: 'currentBalance', label: 'Current Balance', width: '12%', align: 'right', format: 'amount' },
];

@Injectable()
export class ReportPdfService {
  constructor(
    private readonly reportService: ReportService,
    private readonly reportReceivablePayableService: ReportReceivablePayableService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
  ) {}

  async generateCustomerBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getCustomerBalances(db, businessId, actorUserId);
    return this.render(db, businessId, 'Customer Balance Report', 'Customer outstanding balance statement', data.data, [{ label: 'Report', value: 'Receivable' }, { label: 'Rows', value: String(data.meta.total) }], [{ label: 'Total Customers', value: String(data.meta.total) }, { label: 'Current Receivable', value: money(data.totals.currentBalance) }], [{ title: 'Customer Balance Details', columns: balanceColumns.filter((c) => ['code', 'name', 'openingBalance', 'currentBalance'].includes(c.key)), rows: data.data }], 'Customer-Balance-Report');
  }

  async generateVendorBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getVendorBalances(db, businessId, actorUserId);
    return this.render(db, businessId, 'Vendor Balance Report', 'Vendor outstanding balance statement', data.data, [{ label: 'Report', value: 'Payable' }, { label: 'Rows', value: String(data.meta.total) }], [{ label: 'Total Vendors', value: String(data.meta.total) }, { label: 'Current Payable', value: money(data.totals.currentBalance) }], [{ title: 'Vendor Balance Details', columns: balanceColumns, rows: data.data }], 'Vendor-Balance-Report');
  }

  async generateCashBankBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getCashAndBankBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'accountName', label: 'Account Name', width: '34%' }, { key: 'accountCode', label: 'Account Code', width: '18%', align: 'center' }, { key: 'accountType', label: 'Type', width: '14%', align: 'center' }, { key: 'openingBalance', label: 'Opening Balance', width: '17%', align: 'right', format: 'amount' }, { key: 'currentBalance', label: 'Current Balance', width: '17%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, 'Cash & Bank Balance Report', 'Cash and bank account balance statement', data.data, [{ label: 'Report', value: 'Cash & Bank' }, { label: 'Rows', value: String(data.meta.total) }], [{ label: 'Cash Balance', value: money(data.totals.cash) }, { label: 'Bank Balance', value: money(data.totals.bank) }, { label: 'Total Accounts', value: String(data.meta.total) }], [{ title: 'Cash & Bank Balance Details', columns, rows: data.data }], 'Cash-Bank-Balance-Report');
  }

  async generateEmployeeBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getEmployeeBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'employeeCode', label: 'Employee Code', width: '10%' }, { key: 'fullName', label: 'Full Name', width: '15%' }, { key: 'departmentName', label: 'Department', width: '12%' }, { key: 'designationName', label: 'Designation', width: '12%' }, { key: 'employeeStatus', label: 'Status', width: '10%' }, { key: 'accountCode', label: 'Account Code', width: '12%' }, { key: 'openingBalance', label: 'Opening Balance', width: '13%', align: 'right', format: 'amount' }, { key: 'currentBalance', label: 'Current Balance', width: '13%', align: 'right', format: 'amount' }, { key: 'balanceType', label: 'Balance Type', width: '10%' },
    ];
    return this.render(db, businessId, 'Employee Balance Report', 'Employee salary account balance statement', data.data, [{ label: 'Report', value: 'Employee Balance' }, { label: 'Rows', value: String(data.meta.total) }], [{ label: 'Current Balance', value: money(data.totals.currentBalance) }, { label: 'Total Employees', value: String(data.meta.total) }], [{ title: 'Employee Balance Details', columns, rows: data.data }], 'Employee-Balance-Report');
  }

  async generatePartyLedgerPdf(db: DataSource, businessId: string, actorUserId: string, variant: 'receivable' | 'payable', query: LedgerQuery) {
    const data = variant === 'receivable'
      ? await this.reportReceivablePayableService.getReceivableReport(db, businessId, { startDate: query.startDate, endDate: query.endDate, partyId: query.customerId }, actorUserId)
      : await this.reportReceivablePayableService.getPayableReport(db, businessId, { startDate: query.startDate, endDate: query.endDate, partyId: query.vendorId }, actorUserId);
    const title = variant === 'receivable' ? 'Receivable Report' : 'Payable Report';
    const filterParty = variant === 'receivable' ? query.customerId : query.vendorId;
    const filters = [{ label: 'Date Filter', value: query.startDate || query.endDate ? 'Custom Range' : 'All Time' }, { label: 'Period', value: [query.startDate, query.endDate].filter(Boolean).join(' - ') }, { label: variant === 'receivable' ? 'Customer' : 'Vendor', value: filterParty || '' }];
    const columns: ReportPdfColumn[] = [{ key: 'code', label: 'Code', width: '13%' }, { key: 'name', label: 'Name', width: '25%' }, { key: 'openingBalance', label: 'Opening', width: '15%', align: 'right', format: 'amount' }, { key: 'periodDebit', label: 'Debit', width: '15%', align: 'right', format: 'amount' }, { key: 'periodCredit', label: 'Credit', width: '15%', align: 'right', format: 'amount' }, { key: 'closingBalance', label: 'Closing', width: '17%', align: 'right', format: 'amount' }];
    return this.render(db, businessId, title, `${variant === 'receivable' ? 'Customer' : 'Vendor'} ledger balance statement`, data.data, filters, [{ label: 'Opening Balance', value: money(data.totals.openingBalance) }, { label: 'Period Debit', value: money(data.totals.periodDebit) }, { label: 'Period Credit', value: money(data.totals.periodCredit) }, { label: 'Closing Balance', value: money(data.totals.closingBalance) }], [{ title: 'Party Ledger Details', columns, rows: data.data }], `${variant === 'receivable' ? 'Receivable' : 'Payable'}-Report`);
  }

  async generateSummaryPdf(db: DataSource, businessId: string, actorUserId: string, variant: 'sales' | 'purchase', query: SummaryQuery) {
    const data = variant === 'sales'
      ? await this.reportService.getSalesSummaryReport(db, businessId, { ...query }, actorUserId)
      : await this.reportService.getPurchaseSummaryReport(db, businessId, { ...query }, actorUserId);
    const partyLabel = variant === 'sales' ? 'Party' : 'Vendor';
    const partyColumns: ReportPdfColumn[] = [{ key: 'partyCode', label: `${partyLabel} Code`, width: '14%' }, { key: 'partyName', label: `${partyLabel} Name`, width: '24%' }, { key: 'cityName', label: 'City', width: '15%' }, { key: 'invoiceCount', label: 'Invoices', width: '9%', align: 'center' }, { key: 'totalAmount', label: 'Amount', width: '14%', align: 'right', format: 'amount' }, { key: 'totalTaxAmount', label: 'Tax', width: '12%', align: 'right', format: 'amount' }, { key: 'totalDiscountAmount', label: 'Discount', width: '12%', align: 'right', format: 'amount' }];
    const cityColumns: ReportPdfColumn[] = [{ key: 'cityName', label: 'City', width: '28%' }, { key: 'invoiceCount', label: 'Invoices', width: '12%', align: 'center' }, { key: 'totalAmount', label: 'Amount', width: '20%', align: 'right', format: 'amount' }, { key: 'totalTaxAmount', label: 'Tax', width: '20%', align: 'right', format: 'amount' }, { key: 'totalDiscountAmount', label: 'Discount', width: '20%', align: 'right', format: 'amount' }];
    const partyRows = data.partyWise || [];
    return this.render(db, businessId, variant === 'sales' ? 'Sales Summary' : 'Purchase Summary', `${variant === 'sales' ? 'Sales' : 'Purchase'} invoice summary statement`, partyRows, [{ label: 'Period', value: [query.startDate, query.endDate].filter(Boolean).join(' - ') }, { label: 'Scope', value: data.filters.scope || 'ALL' }], [{ label: 'Invoices', value: String(data.totals.invoiceCount) }, { label: 'Total Amount', value: money(data.totals.totalAmount) }, { label: 'Tax Amount', value: money(data.totals.totalTaxAmount) }, { label: 'Discount Amount', value: money(data.totals.totalDiscountAmount) }], [{ title: `${partyLabel} Wise Summary`, columns: partyColumns, rows: partyRows }, { title: 'City Wise Summary', columns: cityColumns, rows: data.cityWise || [] }], `${variant === 'sales' ? 'Sales' : 'Purchase'}-Summary`);
  }

  private async render(db: DataSource, businessId: string, title: string, subtitle: string, _rows: Record<string, unknown>[], filters: Array<{ label: string; value: string }>, summary: Array<{ label: string; value: string }>, sections: ReportPdfSection[], filename: string) {
    const business = await db.getRepository(Business).findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const document: ReportPdfDocument = { title, subtitle, logoDataUri, filters, summary, sections, business: { name: business.name, legalName: business.legalName, address: business.address, phone: business.phone, currency: business.currency }, preparedBy: 'Admin' };
    const buffer = await this.pdfRendererService.renderHtmlToPdf({ html: buildReportPdfHtml(document), enforceSinglePage: false });
    return { buffer, filename: `${safePdfFilenamePart(filename)}.pdf` };
  }
}
