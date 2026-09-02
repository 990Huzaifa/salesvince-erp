import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  formatPakistaniNumber,
  PdfLogoService,
  PdfRendererService,
  safePdfFilenamePart,
} from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { ReportService } from '../report.service';
import { ReportReceivablePayableService } from './report-receivable-payable.service';
import {
  buildReportPdfHtml,
  formatReportDateRange,
  type ReportPdfColumn,
  type ReportPdfDocument,
} from './report-pdf.template';

type SummaryQuery = { startDate?: string; endDate?: string; partyId?: string; cityId?: string };
type LedgerQuery = { startDate?: string; endDate?: string; customerId?: string; vendorId?: string };
type ReportDocumentInput = Omit<ReportPdfDocument, 'business' | 'logoDataUri' | 'preparedBy'>;

const money = (value: unknown): string => formatPakistaniNumber(value);
const dateFilterLabel = (startDate?: string, endDate?: string): string => startDate || endDate ? 'Custom Range' : 'All Time';
const asRows = <T extends object>(rows: T[]): Record<string, unknown>[] => rows.map((row) => ({ ...row }) as Record<string, unknown>);

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
    const rows = data.data.map((row, index) => ({ serial: index + 1, ...row }));
    const columns: ReportPdfColumn[] = [
      { key: 'serial', label: 'S No.', width: '8%', align: 'center' },
      { key: 'code', label: 'Code', width: '10%', align: 'center' },
      { key: 'name', label: 'Name', width: '42%' },
      { key: 'openingBalance', label: 'Opening Balance', width: '14%', align: 'right', format: 'amount' },
      { key: 'currentBalance', label: 'Current Balance', width: '16%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Receivable Report', subtitle: 'Customer outstanding balance statement',
      filters: [{ label: 'Report', value: 'Receivable' }, { label: 'Rows', value: data.meta.total }],
      summary: [{ label: 'Total Customers', value: data.meta.total }, { label: 'Current Receivable', value: money(data.totals.currentBalance) }],
      sections: [{ columns, rows: asRows(rows), emptyMessage: 'No customer balances found' }], minimumRows: 12,
    }, 'Customer-Balance-Report');
  }

  async generateVendorBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getVendorBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'code', label: 'Code', width: '10%', align: 'center' },
      { key: 'name', label: 'Name', width: '18%' },
      { key: 'accountCode', label: 'Account Code', width: '13%', align: 'center' },
      { key: 'address', label: 'Address', width: '23%' },
      { key: 'partyType', label: 'Party Type', width: '12%', align: 'center' },
      { key: 'openingBalance', label: 'Opening Balance', width: '12%', align: 'right', format: 'amount' },
      { key: 'currentBalance', label: 'Current Balance', width: '12%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Payable Report', subtitle: 'Vendor outstanding balance statement',
      filters: [{ label: 'Report', value: 'Payable' }, { label: 'Rows', value: data.meta.total }],
      summary: [{ label: 'Total Vendors', value: data.meta.total }, { label: 'Current Payable', value: money(data.totals.currentBalance) }],
      sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No vendor balances found' }], minimumRows: 12,
    }, 'Vendor-Balance-Report');
  }

  async generateCashBankBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getCashAndBankBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'accountName', label: 'Account Name', width: '34%' }, { key: 'accountCode', label: 'Account Code', width: '18%', align: 'center' }, { key: 'accountType', label: 'Type', width: '14%', align: 'center' }, { key: 'openingBalance', label: 'Opening Balance', width: '17%', align: 'right', format: 'amount' }, { key: 'currentBalance', label: 'Current Balance', width: '17%', align: 'right', format: 'amount' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Cash & Bank Balance', subtitle: 'Current balances for cash and bank accounts',
      filters: [{ label: 'Report', value: 'Cash & Bank' }, { label: 'Rows', value: data.meta.total }],
      summary: [{ label: 'Cash Balance', value: money(data.totals.cash) }, { label: 'Bank Balance', value: money(data.totals.bank) }, { label: 'Total Accounts', value: data.meta.total }],
      sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No cash & bank balances found' }], minimumRows: 12,
    }, 'Cash-Bank-Balance-Report');
  }

  async generateEmployeeBalancesPdf(db: DataSource, businessId: string, actorUserId: string) {
    const data = await this.reportService.getEmployeeBalances(db, businessId, actorUserId);
    const columns: ReportPdfColumn[] = [
      { key: 'employeeCode', label: 'Employee Code', width: '10%' }, { key: 'fullName', label: 'Full Name', width: '14%' }, { key: 'departmentName', label: 'Department', width: '11%' }, { key: 'designationName', label: 'Designation', width: '11%' }, { key: 'employeeStatus', label: 'Status', width: '8%', align: 'center' }, { key: 'accId', label: 'Account ID', width: '12%' }, { key: 'accountCode', label: 'Account Code', width: '10%' }, { key: 'openingBalance', label: 'Opening Balance', width: '10%', align: 'right', format: 'amount' }, { key: 'currentBalance', label: 'Current Balance', width: '10%', align: 'right', format: 'amount' }, { key: 'balanceType', label: 'Balance Type', width: '9%' },
    ];
    return this.render(db, businessId, actorUserId, {
      layout: 'balance', title: 'Employee Balance', subtitle: 'Outstanding balances for employee salary accounts',
      filters: [{ label: 'Report', value: 'Employee Balance' }, { label: 'Rows', value: data.meta.total }],
      summary: [{ label: 'Current Balance', value: money(data.totals.currentBalance) }, { label: 'Total Employees', value: data.meta.total }],
      sections: [{ columns, rows: asRows(data.data), emptyMessage: 'No employee balances found' }], minimumRows: 12,
    }, 'Employee-Balance-Report');
  }

  async generatePartyLedgerPdf(db: DataSource, businessId: string, actorUserId: string, variant: 'receivable' | 'payable', query: LedgerQuery) {
    const partyId = variant === 'receivable' ? query.customerId : query.vendorId;
    const options = { startDate: query.startDate, endDate: query.endDate, partyId, allRows: true };
    const data = variant === 'receivable'
      ? await this.reportReceivablePayableService.getReceivableReport(db, businessId, options, actorUserId)
      : await this.reportReceivablePayableService.getPayableReport(db, businessId, options, actorUserId);
    const title = variant === 'receivable' ? 'Receivable Report' : 'Payable Report';
    const partyName = partyId ? data.data.find((row) => row.id === partyId)?.name : undefined;
    const filters = [{ label: 'Date Filter', value: dateFilterLabel(query.startDate, query.endDate) }, { label: 'Period', value: formatReportDateRange(data.period.startDate, data.period.endDate) }, { label: variant === 'receivable' ? 'Customer' : 'Vendor', value: partyName }];
    const columns: ReportPdfColumn[] = [{ key: 'code', label: 'Code', width: '9%' }, { key: 'name', label: 'Name', width: '16%' }, { key: 'openingBalance', label: 'Opening', width: '11%', align: 'right', format: 'amount' }, { key: 'periodDebit', label: 'Debit', width: '10%', align: 'right', format: 'amount' }, { key: 'periodCredit', label: 'Credit', width: '10%', align: 'right', format: 'amount' }, { key: 'closingBalance', label: 'Closing', width: '11%', align: 'right', format: 'amount' }];
    return this.render(db, businessId, actorUserId, { layout: 'party-ledger', title, subtitle: `${variant === 'receivable' ? 'Customer' : 'Vendor'} ledger balance statement`, filters, summary: [{ label: 'Opening Balance', value: money(data.totals.openingBalance) }, { label: 'Period Debit', value: money(data.totals.periodDebit) }, { label: 'Period Credit', value: money(data.totals.periodCredit) }, { label: 'Closing Balance', value: money(data.totals.closingBalance) }], sections: [{ title: 'Party Ledger Details', columns, rows: asRows(data.data), emptyMessage: 'No party ledger records found.' }], footerRight: `Party Count: ${data.meta.total}` }, `${variant === 'receivable' ? 'Receivable' : 'Payable'}-Report`);
  }

  async generateSummaryPdf(db: DataSource, businessId: string, actorUserId: string, variant: 'sales' | 'purchase', query: SummaryQuery) {
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
    return this.render(db, businessId, actorUserId, { layout: 'summary', title: sales ? 'Sales Summary' : 'Purchase Summary', subtitle: `${sales ? 'Sales' : 'Purchase'} invoice summary statement`, filters: [{ label: 'Date Filter', value: dateFilterLabel(query.startDate, query.endDate) }, { label: 'Period', value: formatReportDateRange(data.period.startDate, data.period.endDate) }, { label: sales ? 'Customer' : 'Vendor', value: filteredParty?.partyName }, { label: 'City', value: filteredCity?.cityName }, { label: 'Scope', value: data.filters.scope || 'ALL' }], summary: [{ label: 'Invoices', value: data.totals.invoiceCount }, { label: 'Total Amount', value: money(data.totals.totalAmount) }, { label: 'Tax Amount', value: money(data.totals.totalTaxAmount) }, { label: 'Discount Amount', value: money(data.totals.totalDiscountAmount) }], sections: [{ title: `${partyLabel} Wise Summary`, columns: partyColumns, rows: asRows(partyRows), emptyMessage: `No ${partyLabel.toLowerCase()} wise summary found.` }, { title: 'City Wise Summary', columns: cityColumns, rows: asRows(data.cityWise || []), emptyMessage: 'No city wise summary found.' }], footerRight: `${partyLabel} Count: ${data.meta.partyCount} | City Count: ${data.meta.cityCount}` }, `${sales ? 'Sales' : 'Purchase'}-Summary`);
  }

  private async render(db: DataSource, businessId: string, actorUserId: string, input: ReportDocumentInput, filename: string) {
    const [business, actor] = await Promise.all([
      db.getRepository(Business).findOne({ where: { id: businessId } }),
      db.getRepository(User).findOne({ where: { id: actorUserId }, select: { id: true, name: true } }),
    ]);
    if (!business) throw new NotFoundException('Business not found');
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const document: ReportPdfDocument = {
      ...input,
      logoDataUri,
      business: { name: business.name, legalName: business.legalName, address: business.address, phone: business.phone, currency: business.currency },
      preparedBy: actor?.name || 'Admin',
    };
    const buffer = await this.pdfRendererService.renderHtmlToPdf({ html: buildReportPdfHtml(document), enforceSinglePage: false });
    return { buffer, filename: `${safePdfFilenamePart(filename)}.pdf` };
  }
}
