import { formatDocumentDate } from 'src/common/pdf';
import type { BusinessPdfContext } from 'src/common/pdf/pdf-context.types';

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
