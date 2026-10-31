import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { DocumentTemplateDocumentType } from 'src/master-db/entities/document-template-item.entity';
import { formatDocumentDate, PdfLogoService, PdfRendererService, safePdfFilenamePart } from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { User } from 'src/tenant-db/entities/user.entity';
import { DocumentTemplateRendererService } from '../document-template-renderer.service';

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
    private readonly documentTemplateRendererService: DocumentTemplateRendererService,
  ) {}

  async generateListPdf(
    db: DataSource,
    businessId: string,
    actorUserId: string,
    filters: GrnPdfFilters,
    tenantId?: string,
    clientIp?: string,
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
    const companyInfo = {
      name: business.name,
      legalName: business.legalName,
      address: business.address,
      phone: business.phone,
      mobile: business.phone,
      currency: business.currency,
      logo: logoDataUri,
    };
    const html = await this.documentTemplateRendererService.render(
      db,
      businessId,
      DocumentTemplateDocumentType.GRN,
      {
        grns: rows,
        grnRows: rows,
        items: rows,
        rows,
        filters,
        preparedBy: actor?.name || 'Admin',
        companyInfo,
      },
      tenantId,
      clientIp,
    );
    const buffer = await this.pdfRendererService.renderHtmlToPdf({
      html,
      enforceSinglePage: false,
    });

    return { buffer, filename: `${safePdfFilenamePart('Receiving-Report')}.pdf` };
  }
}
