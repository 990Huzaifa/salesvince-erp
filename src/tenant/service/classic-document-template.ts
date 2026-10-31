import {
  formatDocumentDate,
  formatMonthName,
  formatPrintedAt,
  type BusinessPdfContext,
  type PrintThemeColors,
} from 'src/common/pdf';
import { DocumentTemplateDocumentType as DocumentType } from 'src/master-db/entities/document-template-item.entity';
import { buildPayslipPdfHtml } from './hr/payslip-pdf.template';
import { buildPurchaseInvoicePdfHtml } from './purchase/purchase-invoice-pdf.template';
import { buildGeneralLedgerPdfHtml } from './report/general-ledger-pdf.template';
import { buildReportPdfHtml } from './report/report-pdf.template';
import type { ReportPdfDocument } from './report/report-pdf.types';
import { buildSaleInvoicePdfHtml } from './sale/sale-invoice-pdf.template';
import { buildWarehouseSlipPdfHtml } from './warehouse-slip-pdf.template';

type SaleInvoice = Parameters<typeof buildSaleInvoicePdfHtml>[0];
type Payslip = Parameters<typeof buildPayslipPdfHtml>[0] & {
  periodMonth: number;
  periodYear: number;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Classic uses the original code layouts, independent of saved pack HTML. */
export const buildClassicDocumentPdfHtml = (
  documentType: DocumentType,
  data: Record<string, unknown>,
  theme: PrintThemeColors,
  timeZone: string,
): string | null => {
  const business = data.companyInfo as BusinessPdfContext & { logo?: string };
  const logo = business?.logo || (data.logoDataUri as string) || null;
  const printedAt = new Date();
  const showBalanceDetails = data.showBalanceDetails !== false;

  switch (documentType) {
    case DocumentType.SALE_INVOICE:
      return buildSaleInvoicePdfHtml(data.invoice as SaleInvoice, business, logo, showBalanceDetails, printedAt, { theme, timeZone });
    case DocumentType.PURCHASE_INVOICE:
      return buildPurchaseInvoicePdfHtml(
        data.invoice as Parameters<typeof buildPurchaseInvoicePdfHtml>[0],
        business, logo, showBalanceDetails, printedAt, theme, timeZone,
      );
    case DocumentType.SALE_ORDER: {
      const order = data.order as SaleInvoice & {
        orderNumber: string;
        orderDate: string;
        orderStatus: string;
        discountAmount: number;
      };
      return buildSaleInvoicePdfHtml({
        ...order,
        invoiceNumber: order.orderNumber,
        invoiceDate: order.orderDate,
        totalDiscountAmount: order.discountAmount,
      }, business, logo, showBalanceDetails, printedAt, {
        documentTitle: 'Sale Order',
        documentNumberLabel: 'Order No.',
        orderNumber: order.orderNumber,
        watermarkText: String(order.orderStatus || '').toUpperCase() || 'DRAFT',
        theme,
        timeZone,
      });
    }
    case DocumentType.WAREHOUSE_SLIP:
      return buildWarehouseSlipPdfHtml(
        data.slip as Parameters<typeof buildWarehouseSlipPdfHtml>[0],
        business, logo, printedAt, { theme, timeZone },
      );
    case DocumentType.PAYSLIP: {
      const payslip = data.paySlip as Payslip;
      return buildPayslipPdfHtml({
        ...payslip,
        periodLabel: `${formatMonthName(payslip.periodMonth)} ${payslip.periodYear}`,
        payslipDate: formatPrintedAt(payslip.createdAt || payslip.updatedAt || printedAt, timeZone),
        paymentDate: formatDocumentDate(payslip.paymentDate, timeZone),
        isApproved: String(payslip.status).toLowerCase() === 'approved',
        business,
      }, logo);
    }
    case DocumentType.GENERAL_LEDGER:
      return buildGeneralLedgerPdfHtml({
        ...(data.ledger as Omit<Parameters<typeof buildGeneralLedgerPdfHtml>[0], 'business' | 'preparedBy'>),
        business,
        preparedBy: String(data.preparedBy || 'Admin'),
      }, logo, printedAt, theme, timeZone);
    case DocumentType.PARTY_LEDGER:
    case DocumentType.REPORT:
      return buildReportPdfHtml(data.report as ReportPdfDocument, printedAt, theme, timeZone);
    case DocumentType.GRN:
    case DocumentType.ACCOUNTS_LIST: {
      const grn = documentType === DocumentType.GRN;
      const filters = (data.filters || {}) as { search?: string; status?: string };
      const document: ReportPdfDocument = {
        layout: 'balance',
        title: grn ? 'Receiving Report' : 'Opening Balance',
        business,
        logoDataUri: logo,
        preparedBy: String(data.preparedBy || 'Admin'),
        filters: grn ? [
          { label: 'Report', value: 'Receiving' },
          { label: 'Search', value: filters.search?.trim() || 'All receiving records' },
          ...(filters.status ? [{ label: 'Status', value: filters.status }] : []),
        ] : [
          { label: 'Account Type', value: String(data.category || '') },
          ...(data.search ? [{ label: 'Search', value: String(data.search) }] : []),
        ],
        summary: [],
        sections: [{
          columns: grn ? [
            { key: 'date', label: 'Date', width: '13%', align: 'center' },
            { key: 'grnNumber', label: 'GRN Code', width: '14%', align: 'center' },
            { key: 'purchaseOrder', label: 'PO', width: '13%', align: 'center' },
            { key: 'vendor', label: 'Vendor', width: '19%' },
            { key: 'warehouse', label: 'Warehouse', width: '17%' },
            { key: 'totalAmount', label: 'Amount', width: '13%', align: 'right', format: 'amount' },
            { key: 'status', label: 'Status', width: '11%', align: 'center' },
          ] : [
            { key: 'serial', label: 'S No.', width: '10%', align: 'center' },
            { key: 'code', label: 'Account Code', width: '25%' },
            { key: 'name', label: 'Account Name', width: '40%' },
            { key: 'openingBalance', label: 'Opening Balance', width: '25%', align: 'right', format: 'amount' },
          ],
          rows: data.rows as Record<string, unknown>[],
          emptyMessage: grn ? 'No receiving records found' : 'No opening balance data found',
        }],
      };
      return buildReportPdfHtml(document, printedAt, theme, timeZone);
    }
    default:
      return null;
  }
};
