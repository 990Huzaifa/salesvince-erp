import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { formatDocumentDate, PdfLogoService, PdfRendererService, safePdfFilenamePart } from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { buildReportPdfHtml, type ReportPdfDocument } from '../report/report-pdf.template';

type GrnPdfFilters = {
  search?: string;
  vendorId?: string;
  warehouseId?: string;
  purchaseOrderId?: string;
  status?: GrnStatus;
};

@Injectable()
export class GrnPdfService {
  constructor(
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
  ) {}

  async generateListPdf(
    db: DataSource,
    businessId: string,
    actorUserId: string,
    filters: GrnPdfFilters,
  ) {
    const query = db.getRepository(Grn)
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('grn.warehouse', 'warehouse')
      .leftJoinAndSelect('grn.vendor', 'vendor')
      .where('grn.businessId = :businessId', { businessId })
      .andWhere('grn.deletedAt IS NULL');

    if (filters.vendorId) query.andWhere('grn.vendorId = :vendorId', { vendorId: filters.vendorId });
    if (filters.warehouseId) query.andWhere('grn.warehouseId = :warehouseId', { warehouseId: filters.warehouseId });
    if (filters.purchaseOrderId) query.andWhere('grn.purchaseOrderId = :purchaseOrderId', { purchaseOrderId: filters.purchaseOrderId });
    if (filters.status) query.andWhere('grn.status = :status', { status: filters.status });
    if (filters.search?.trim()) {
      const search = `%${filters.search.trim()}%`;
      query.andWhere(new Brackets((subQuery) => {
        subQuery
          .where('grn.grnNumber ILIKE :search', { search })
          .orWhere('vendor.name ILIKE :search', { search })
          .orWhere('vendor.code ILIKE :search', { search })
          .orWhere('purchaseOrder.orderNumber ILIKE :search', { search });
      }));
    }

    const [grns, business, actor] = await Promise.all([
      query.orderBy('grn.grnDate', 'DESC').addOrderBy('grn.createdAt', 'DESC').getMany(),
      db.getRepository(Business).findOne({ where: { id: businessId } }),
      db.getRepository(User).findOne({ where: { id: actorUserId }, select: { id: true, name: true } }),
    ]);
    if (!business) throw new NotFoundException('Business not found');

    const rows = grns.map((grn) => ({
      date: formatDocumentDate(grn.grnDate),
      grnNumber: grn.grnNumber,
      purchaseOrder: grn.purchaseOrder?.orderNumber || 'N/A',
      vendor: grn.vendor?.name || 'N/A',
      warehouse: grn.warehouse?.name || 'N/A',
      totalAmount: Number(grn.totalAmount || 0),
      status: grn.status,
    }));
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const document: ReportPdfDocument = {
      layout: 'balance',
      title: 'Receiving Report',
      business: { name: business.name, legalName: business.legalName, address: business.address, phone: business.phone, currency: business.currency },
      logoDataUri,
      filters: [
        { label: 'Report', value: 'Receiving' },
        { label: 'Search', value: filters.search?.trim() || 'All receiving records' },
        ...(filters.status ? [{ label: 'Status', value: filters.status }] : []),
      ],
      summary: [],
      sections: [{
        columns: [
          { key: 'date', label: 'Date', width: '13%', align: 'center' },
          { key: 'grnNumber', label: 'GRN Code', width: '14%', align: 'center' },
          { key: 'purchaseOrder', label: 'PO', width: '13%', align: 'center' },
          { key: 'vendor', label: 'Vendor', width: '19%' },
          { key: 'warehouse', label: 'Warehouse', width: '17%' },
          { key: 'totalAmount', label: 'Amount', width: '13%', align: 'right', format: 'amount' },
          { key: 'status', label: 'Status', width: '11%', align: 'center' },
        ],
        rows,
        emptyMessage: 'No receiving records found',
      }],
      preparedBy: actor?.name || 'Admin',
    };
    const buffer = await this.pdfRendererService.renderHtmlToPdf({
      html: buildReportPdfHtml(document),
      enforceSinglePage: false,
    });

    return { buffer, filename: `${safePdfFilenamePart('Receiving-Report')}.pdf` };
  }
}
