import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { DocumentTemplateDocumentType } from 'src/master-db/entities/document-template-item.entity';
import { Business } from 'src/tenant-db/entities/business.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { StockTransfer } from 'src/tenant-db/entities/stock-transfer.entity';
import { OpeningStock } from 'src/tenant-db/entities/opening-stock.entity';
import {
  PdfLogoService,
  PdfRendererService,
  safePdfFilenamePart,
} from 'src/common/pdf';
import { ActivityLogService } from './activity-log.service';
import { DocumentTemplateRendererService } from './document-template-renderer.service';
import {
  type WarehouseSlipDto,
  type WarehouseSlipItemDto,
} from './warehouse-slip.types';

@Injectable()
export class WarehouseSlipPdfService {
  constructor(
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
    private readonly documentTemplateRendererService: DocumentTemplateRendererService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private formatWarehouseLabel(
    warehouse?: { code?: string | null; name?: string | null } | null,
  ): string | undefined {
    if (!warehouse) return undefined;
    const code = warehouse.code?.trim();
    const name = warehouse.name?.trim();
    if (code && name) return `${code} - ${name}`;
    return code || name || undefined;
  }

  private mapLineItem(item: {
    product?: {
      name?: string | null;
      skuCode?: string | null;
      barcode?: string | null;
    } | null;
    productFlavour?: { flavour?: { name?: string | null } | null } | null;
    uom?: { name?: string | null } | null;
    quantity?: number | null;
    deliveredQuantity?: number | null;
    orderedQuantity?: number | null;
  }): WarehouseSlipItemDto {
    const quantity = Number(
      item.quantity ?? item.deliveredQuantity ?? item.orderedQuantity ?? 0,
    );
    return {
      productName: item.product?.name?.trim() || '-',
      skuCode: item.product?.skuCode?.trim() || undefined,
      barcode: item.product?.barcode?.trim() || undefined,
      flavour: item.productFlavour?.flavour?.name?.trim() || undefined,
      uom: item.uom?.name?.trim() || '-',
      quantity,
    };
  }

  private async renderSlipPdf(
    tenantDb: DataSource,
    businessId: string,
    slip: WarehouseSlipDto,
    tenantId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const business = await tenantDb.getRepository(Business).findOne({
      where: { id: businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const companyInfo = {
      name: business.name,
      phone: business.phone,
      mobile: business.phone,
      address: business.address,
      logo: logoDataUri,
    };
    const html = await this.documentTemplateRendererService.render(
      tenantDb,
      businessId,
      DocumentTemplateDocumentType.WAREHOUSE_SLIP,
      { slip, warehouseSlip: slip, companyInfo, ...slip },
      tenantId,
    );

    const buffer = await this.pdfRendererService.renderHtmlToPdf({
      html,
      enforceSinglePage: false,
    });

    return {
      buffer,
      filename: `Warehouse-Slip-${safePdfFilenamePart(slip.documentNumber)}.pdf`,
    };
  }

  async generateForSaleInvoice(
    tenantDb: DataSource,
    businessId: string | undefined,
    invoiceId: string,
    actorUserId: string,
    tenantId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const invoice = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }

    const items = (invoice.items ?? []).map((item) => this.mapLineItem(item));
    const warehouseLabels = [
      ...new Set(
        (invoice.items ?? [])
          .map((item) => this.formatWarehouseLabel(item.warehouse))
          .filter((label): label is string => Boolean(label)),
      ),
    ];

    const slip: WarehouseSlipDto = {
      documentTypeLabel: 'Sale Invoice',
      documentNumber: invoice.invoiceNumber,
      documentDate: invoice.invoiceDate,
      partyLabel: 'Customer',
      partyName: invoice.customer?.name,
      partyCode: invoice.customer?.code,
      warehouseLabel: warehouseLabels.join(', ') || undefined,
      notes: null,
      totalQuantity: items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      ),
      items,
    };

    const result = await this.renderSlipPdf(
      tenantDb,
      scopedBusinessId,
      slip,
      tenantId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_INVOICE_WAREHOUSE_SLIP_PDF_DOWNLOADED',
      description: `Warehouse slip PDF downloaded for sale invoice ${invoice.invoiceNumber}`,
      metadata: { saleInvoiceId: invoice.id },
    });

    return result;
  }

  async generateForPurchaseInvoice(
    tenantDb: DataSource,
    businessId: string | undefined,
    invoiceId: string,
    actorUserId: string,
    tenantId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const invoice = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .leftJoinAndSelect('invoice.grn', 'grn')
      .leftJoinAndSelect('grn.warehouse', 'warehouse')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    const items = (invoice.items ?? []).map((item) => this.mapLineItem(item));

    const slip: WarehouseSlipDto = {
      documentTypeLabel: 'Purchase Invoice',
      documentNumber: invoice.invoiceNumber,
      documentDate: invoice.invoiceDate,
      partyLabel: 'Vendor',
      partyName: invoice.vendor?.name,
      partyCode: invoice.vendor?.code,
      warehouseLabel: this.formatWarehouseLabel(invoice.grn?.warehouse),
      notes: null,
      totalQuantity: items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      ),
      items,
    };

    const result = await this.renderSlipPdf(
      tenantDb,
      scopedBusinessId,
      slip,
      tenantId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_INVOICE_WAREHOUSE_SLIP_PDF_DOWNLOADED',
      description: `Warehouse slip PDF downloaded for purchase invoice ${invoice.invoiceNumber}`,
      metadata: { purchaseInvoiceId: invoice.id },
    });

    return result;
  }

  async generateForStockTransfer(
    tenantDb: DataSource,
    businessId: string | undefined,
    transferId: string,
    actorUserId: string,
    tenantId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const transfer = await tenantDb
      .getRepository(StockTransfer)
      .createQueryBuilder('st')
      .leftJoinAndSelect('st.fromWarehouse', 'fromWarehouse')
      .leftJoinAndSelect('st.toWarehouse', 'toWarehouse')
      .leftJoinAndSelect('st.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('st.id = :transferId', { transferId })
      .andWhere('st.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('st.deletedAt IS NULL')
      .getOne();

    if (!transfer) {
      throw new NotFoundException('Stock transfer not found');
    }

    const items = (transfer.items ?? []).map((item) => this.mapLineItem(item));

    const slip: WarehouseSlipDto = {
      documentTypeLabel: 'Stock Transfer',
      documentNumber: transfer.transferNumber,
      documentDate: transfer.transferDate,
      fromWarehouse: this.formatWarehouseLabel(transfer.fromWarehouse),
      toWarehouse: this.formatWarehouseLabel(transfer.toWarehouse),
      notes: transfer.notes,
      totalQuantity: items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      ),
      items,
    };

    const result = await this.renderSlipPdf(
      tenantDb,
      scopedBusinessId,
      slip,
      tenantId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_WAREHOUSE_SLIP_PDF_DOWNLOADED',
      description: `Warehouse slip PDF downloaded for stock transfer ${transfer.transferNumber}`,
      metadata: { stockTransferId: transfer.id },
    });

    return result;
  }

  async generateForOpeningStock(
    tenantDb: DataSource,
    businessId: string | undefined,
    openingStockId: string,
    actorUserId: string,
    tenantId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const opening = await tenantDb
      .getRepository(OpeningStock)
      .createQueryBuilder('opening')
      .leftJoinAndSelect('opening.warehouse', 'warehouse')
      .leftJoinAndSelect('opening.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('opening.id = :openingStockId', { openingStockId })
      .andWhere('opening.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('opening.deletedAt IS NULL')
      .getOne();

    if (!opening) {
      throw new NotFoundException('Opening stock not found');
    }

    const items = (opening.items ?? []).map((item) => this.mapLineItem(item));
    const slip: WarehouseSlipDto = {
      documentTypeLabel: 'Opening Stock',
      documentNumber: opening.openingNumber,
      documentDate: opening.openingDate,
      warehouseLabel: this.formatWarehouseLabel(opening.warehouse),
      notes: opening.notes,
      totalQuantity: items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
      ),
      items,
    };

    const result = await this.renderSlipPdf(
      tenantDb,
      scopedBusinessId,
      slip,
      tenantId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'OPENING_STOCK_WAREHOUSE_SLIP_PDF_DOWNLOADED',
      description: `Warehouse slip PDF downloaded for opening stock ${opening.openingNumber}`,
      metadata: { openingStockId: opening.id },
    });

    return result;
  }
}
