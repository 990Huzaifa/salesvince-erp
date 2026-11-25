import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  DocumentTemplate,
  DocumentTemplateStatus,
} from 'src/master-db/entities/document-template.entity';
import { DocumentTemplateDocumentType } from 'src/master-db/entities/document-template-item.entity';
import {
  Tenant,
  TenantStatus,
} from 'src/master-db/entities/tenant.entity';
import {
  buildPublicDocumentViewUrl,
  formatDocumentDate,
  PdfLogoService,
  type PublicDocumentViewKind,
} from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { BusinessSettings } from 'src/tenant-db/entities/business-settings.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
} from 'src/tenant-db/entities/purchase-invoice.entity';
import { PurchaseOrder } from 'src/tenant-db/entities/purchase-order.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleItemType } from 'src/tenant-db/entities/sale-item-type';
import { SaleOrder } from 'src/tenant-db/entities/sale-order.entity';
import { TenantConnectionManager } from 'src/tenant-db/services/tenant-connection-manager.service';
import { DocumentTemplateRendererService } from './document-template-renderer.service';
import { MasterTenantDataService } from './master-tenant-data.service';
import { WarehouseSlipPdfService } from './warehouse-slip-pdf.service';

type PublicBusiness = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  logo: string | null;
  currency: string;
  phone: string | null;
  address: string | null;
};

type PublicParty = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  ntnNumber: string | null;
  strnNumber: string | null;
};

type PublicDesign = {
  templateId: string;
  templateName: string;
  templateCode: string;
};

type PublicViewOptions = {
  tenantHost?: string;
  clientIp?: string | null;
};

@Injectable()
export class PublicDocumentViewService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplateRepository: Repository<DocumentTemplate>,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly documentTemplateRendererService: DocumentTemplateRendererService,
    private readonly pdfLogoService: PdfLogoService,
    private readonly masterTenantDataService: MasterTenantDataService,
    private readonly warehouseSlipPdfService: WarehouseSlipPdfService,
  ) {}

  async getSaleOrder(id: string, options: PublicViewOptions) {
    const { tenant, tenantDb } = await this.resolveTenantDb(options.tenantHost);
    const order = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('so.id = :id', { id })
      .getOne();

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    const business = await this.loadBusiness(tenantDb, order.businessId);
    const design = await this.resolveDesign(tenantDb, business.id, tenant.id);
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);

    const publicData = {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      orderDate: order.orderDate,
      notes: order.notes,
      orderTotal: Number(order.orderTotal ?? 0),
      deliveryCost: Number(order.deliveryCost ?? 0),
      taxPercentage: Number(order.taxPercentage ?? 0),
      taxAmount: Number(order.taxAmount ?? 0),
      discountPercentage: Number(order.discountPercentage ?? 0),
      discountAmount: Number(order.discountAmount ?? 0),
      totalAmount: Number(order.totalAmount ?? 0),
      customer: this.mapParty(order.customer),
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        itemType: item.itemType ?? SaleItemType.PRODUCT,
        product: item.product
          ? { name: item.product.name, skuCode: item.product.skuCode }
          : null,
        service: item.service
          ? { code: item.service.code, name: item.service.name }
          : null,
        flavour: item.productFlavour?.flavour?.name ?? null,
        unit: item.uom?.name ?? null,
        quantity: Number(item.quantity ?? 0),
        rate: Number(item.saleUnitPrice ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const templateOrder = {
      ...publicData,
      invoice_no: order.orderNumber,
      invoice_date: order.orderDate,
      order_no: order.orderNumber,
      order_date: order.orderDate,
      vendor_code: order.customer?.code ?? '',
      vendor_name: order.customer?.name ?? '',
      vendor_address: order.customer?.address ?? '',
      vendor_city: '',
      total: publicData.totalAmount,
      total_tax: publicData.taxAmount,
      total_discount: publicData.discountAmount,
      previous_balance: '',
      current_balance: '',
      this_bill: '',
      items: (order.items ?? []).map((item) => ({
        product_id:
          item.service?.code ||
          item.product?.skuCode ||
          item.productId ||
          item.serviceId ||
          '',
        product_name: item.service?.name || item.product?.name || '',
        measurement_unit: item.uom?.name || '',
        unit_price: Number(item.saleUnitPrice ?? 0),
        rate: Number(item.saleUnitPrice ?? 0),
        qty: Number(item.quantity ?? 0),
        quantity: Number(item.quantity ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        total: Number(item.totalAmount ?? 0),
        amount: Number(item.totalAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const html = await this.documentTemplateRendererService.render(
      tenantDb,
      business.id,
      DocumentTemplateDocumentType.SALE_ORDER,
      {
        order: templateOrder,
        saleOrder: templateOrder,
        companyInfo: this.companyInfo(business, logoDataUri),
        orderNumber: order.orderNumber,
        showBalanceDetails: false,
      },
      tenant.id,
      options.clientIp,
      undefined,
      buildPublicDocumentViewUrl('sale-order', order.id, tenant.name),
    );

    return this.wrapResponse(
      'SALE_ORDER',
      tenant,
      business,
      design,
      publicData,
      html,
    );
  }

  async getSaleInvoice(id: string, options: PublicViewOptions) {
    const { tenant, tenantDb } = await this.resolveTenantDb(options.tenantHost);
    const invoice = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('invoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('invoice.id = :id', { id })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }

    const business = await this.loadBusiness(tenantDb, invoice.businessId);
    const design = await this.resolveDesign(tenantDb, business.id, tenant.id);
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const activeItems = (invoice.items ?? []).filter(
      (item: SaleInvoiceItem) => !item.deletedAt,
    );
    const deliveryCost = Number(
      invoice.deliveryNote?.deliveryCost ??
        invoice.saleOrder?.deliveryCost ??
        0,
    );

    const lineDiscountTotal = activeItems.reduce(
      (sum, item) => sum + Number(item.discountAmount ?? 0),
      0,
    );
    // Stored totalDiscountAmount is header-only; templates expect header + line discounts.
    const totalDiscountAmount =
      Number(invoice.totalDiscountAmount ?? 0) + lineDiscountTotal;

    const publicData = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      saleOrderNumber: invoice.saleOrder?.orderNumber ?? null,
      deliveryCost,
      totalTaxAmount: Number(invoice.totalTaxAmount ?? 0),
      totalDiscountAmount,
      totalAmount: Number(invoice.totalAmount ?? 0),
      customer: this.mapParty(invoice.customer),
      items: activeItems.map((item) => ({
        id: item.id,
        itemType: item.itemType ?? SaleItemType.PRODUCT,
        product: item.product
          ? { name: item.product.name, skuCode: item.product.skuCode }
          : null,
        service: item.service
          ? { code: item.service.code, name: item.service.name }
          : null,
        flavour: item.productFlavour?.flavour?.name ?? null,
        unit: item.uom?.name ?? null,
        quantity: Number(item.quantity ?? 0),
        rate: Number(item.saleUnitPrice ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        taxPercentage: Number(item.taxPercentage ?? 0),
        taxAmount: Number(item.taxAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const templateInvoice = {
      ...publicData,
      invoice_no: invoice.invoiceNumber,
      invoice_date: formatDocumentDate(invoice.invoiceDate),
      vendor_code: invoice.customer?.code ?? '',
      vendor_name: invoice.customer?.name ?? '',
      vendor_address: invoice.customer?.address ?? '',
      vendor_city: '',
      total: publicData.totalAmount,
      total_tax: publicData.totalTaxAmount,
      total_discount: totalDiscountAmount,
      delivery_cost: deliveryCost,
      previous_balance: '',
      current_balance: '',
      this_bill: '',
      items: activeItems.map((item) => {
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = Number(item.saleUnitPrice ?? 0);
        const discountPercentage = Number(item.discountPercentage ?? 0);
        const discountAmount = Number(item.discountAmount ?? 0);
        const discountedUnitPrice =
          quantity > 0 && discountAmount
            ? Math.max(0, unitPrice - discountAmount / quantity)
            : Math.max(0, unitPrice * (1 - discountPercentage / 100));
        return {
          product_id:
            item.service?.code ||
            item.product?.skuCode ||
            item.productId ||
            item.serviceId ||
            '',
          product_name: item.service?.name || item.product?.name || '',
          product: {
            id:
              item.service?.code ||
              item.product?.skuCode ||
              item.productId ||
              item.serviceId ||
              '',
            title: item.service?.name || item.product?.name || '',
            name: item.product?.name,
            skuCode: item.product?.skuCode,
          },
          measurement_unit: item.uom?.name || '',
          unit_price: unitPrice,
          rate: unitPrice,
          qty: quantity,
          quantity,
          discount: discountPercentage || discountAmount,
          discount_amount: discountAmount,
          discounted_unit_price: discountedUnitPrice,
          discount_in_percentage: discountPercentage > 0 ? 1 : 0,
          discountPercentage,
          discountAmount,
          taxPercentage: Number(item.taxPercentage ?? 0),
          taxAmount: Number(item.taxAmount ?? 0),
          total: Number(item.totalAmount ?? 0),
          totalAmount: Number(item.totalAmount ?? 0),
        };
      }),
    };

    const html = await this.documentTemplateRendererService.render(
      tenantDb,
      business.id,
      DocumentTemplateDocumentType.SALE_INVOICE,
      {
        invoice: templateInvoice,
        companyInfo: this.companyInfo(business, logoDataUri),
        invoiceNo: invoice.invoiceNumber,
        showBalanceDetails: false,
      },
      tenant.id,
      options.clientIp,
      undefined,
      buildPublicDocumentViewUrl('sale-invoice', invoice.id, tenant.name),
    );

    return this.wrapResponse(
      'SALE_INVOICE',
      tenant,
      business,
      design,
      publicData,
      html,
    );
  }

  async getPurchaseOrder(id: string, options: PublicViewOptions) {
    const { tenant, tenantDb } = await this.resolveTenantDb(options.tenantHost);
    const order = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('po.warehouse', 'warehouse')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('po.id = :id', { id })
      .getOne();

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    const business = await this.loadBusiness(tenantDb, order.businessId);
    const design = await this.resolveDesign(tenantDb, business.id, tenant.id);
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);

    const publicData = {
      id: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      orderDate: order.orderDate,
      notes: order.notes,
      warehouse: order.warehouse
        ? { code: order.warehouse.code, name: order.warehouse.name }
        : null,
      orderTotal: Number(order.orderTotal ?? 0),
      deliveryCost: Number(order.deliveryCost ?? 0),
      taxPercentage: Number(order.taxPercentage ?? 0),
      taxAmount: Number(order.taxAmount ?? 0),
      discountPercentage: Number(order.discountPercentage ?? 0),
      discountAmount: Number(order.discountAmount ?? 0),
      totalAmount: Number(order.totalAmount ?? 0),
      vendor: this.mapParty(order.vendor),
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        product: item.product
          ? { name: item.product.name, skuCode: item.product.skuCode }
          : null,
        flavour: item.productFlavour?.flavour?.name ?? null,
        unit: item.uom?.name ?? null,
        quantity: Number(item.quantity ?? 0),
        rate: Number(item.purchaseUnitPrice ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const templateOrder = {
      ...publicData,
      invoice_no: order.orderNumber,
      invoice_date: order.orderDate,
      order_no: order.orderNumber,
      order_date: order.orderDate,
      vendor_code: order.vendor?.code ?? '',
      vendor_name: order.vendor?.name ?? '',
      vendor_address: order.vendor?.address ?? '',
      vendor_city: '',
      total: publicData.totalAmount,
      total_tax: publicData.taxAmount,
      total_discount: publicData.discountAmount,
      previous_balance: '',
      current_balance: '',
      this_bill: '',
      items: (order.items ?? []).map((item) => ({
        product_id: item.product?.skuCode || item.productId || '',
        product_name: item.product?.name || '',
        measurement_unit: item.uom?.name || '',
        unit_price: Number(item.purchaseUnitPrice ?? 0),
        rate: Number(item.purchaseUnitPrice ?? 0),
        qty: Number(item.quantity ?? 0),
        quantity: Number(item.quantity ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        total: Number(item.totalAmount ?? 0),
        amount: Number(item.totalAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const html = await this.documentTemplateRendererService.render(
      tenantDb,
      business.id,
      DocumentTemplateDocumentType.PURCHASE_ORDER,
      {
        order: templateOrder,
        purchaseOrder: templateOrder,
        companyInfo: this.companyInfo(business, logoDataUri),
        orderNumber: order.orderNumber,
        showBalanceDetails: false,
      },
      tenant.id,
      options.clientIp,
      undefined,
      buildPublicDocumentViewUrl('purchase-order', order.id, tenant.name),
    );

    return this.wrapResponse(
      'PURCHASE_ORDER',
      tenant,
      business,
      design,
      publicData,
      html,
    );
  }

  async getPurchaseInvoice(id: string, options: PublicViewOptions) {
    const { tenant, tenantDb } = await this.resolveTenantDb(options.tenantHost);
    const invoice = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .leftJoinAndSelect('invoice.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('invoice.id = :id', { id })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    const business = await this.loadBusiness(tenantDb, invoice.businessId);
    const design = await this.resolveDesign(tenantDb, business.id, tenant.id);
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const activeItems = (invoice.items ?? []).filter(
      (item: PurchaseInvoiceItem) => !item.deletedAt,
    );

    const publicData = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      purchaseOrderNumber: invoice.purchaseOrder?.orderNumber ?? null,
      totalTaxAmount: Number(invoice.totalTaxAmount ?? 0),
      totalDiscountAmount: Number(invoice.totalDiscountAmount ?? 0),
      totalAmount: Number(invoice.totalAmount ?? 0),
      vendor: this.mapParty(invoice.vendor),
      items: activeItems.map((item) => ({
        id: item.id,
        product: item.product
          ? { name: item.product.name, skuCode: item.product.skuCode }
          : null,
        flavour: item.productFlavour?.flavour?.name ?? null,
        unit: item.uom?.name ?? null,
        quantity: Number(item.quantity ?? 0),
        rate: Number(item.purchaseUnitPrice ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        taxPercentage: Number(item.taxPercentage ?? 0),
        taxAmount: Number(item.taxAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const templateInvoice = {
      ...publicData,
      invoice_no: invoice.invoiceNumber,
      invoice_date: invoice.invoiceDate,
      vendor_code: invoice.vendor?.code ?? '',
      vendor_name: invoice.vendor?.name ?? '',
      vendor_address: invoice.vendor?.address ?? '',
      vendor_city: '',
      total: publicData.totalAmount,
      total_tax: publicData.totalTaxAmount,
      total_discount: publicData.totalDiscountAmount,
      previous_balance: '',
      current_balance: '',
      this_bill: '',
      items: activeItems.map((item) => ({
        product_id: item.product?.skuCode || item.productId || '',
        product_name: item.product?.name || '',
        measurement_unit: item.uom?.name || '',
        unit_price: Number(item.purchaseUnitPrice ?? 0),
        rate: Number(item.purchaseUnitPrice ?? 0),
        qty: Number(item.quantity ?? 0),
        quantity: Number(item.quantity ?? 0),
        discountPercentage: Number(item.discountPercentage ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
        taxPercentage: Number(item.taxPercentage ?? 0),
        taxAmount: Number(item.taxAmount ?? 0),
        total: Number(item.totalAmount ?? 0),
        amount: Number(item.totalAmount ?? 0),
        totalAmount: Number(item.totalAmount ?? 0),
      })),
    };

    const html = await this.documentTemplateRendererService.render(
      tenantDb,
      business.id,
      DocumentTemplateDocumentType.PURCHASE_INVOICE,
      {
        invoice: templateInvoice,
        purchaseInvoice: templateInvoice,
        companyInfo: this.companyInfo(business, logoDataUri),
        invoiceNo: invoice.invoiceNumber,
        showBalanceDetails: false,
      },
      tenant.id,
      options.clientIp,
      undefined,
      buildPublicDocumentViewUrl('purchase-invoice', invoice.id, tenant.name),
    );

    return this.wrapResponse(
      'PURCHASE_INVOICE',
      tenant,
      business,
      design,
      publicData,
      html,
    );
  }

  async getWarehouseSlip(
    sourceType: string,
    sourceId: string,
    options: PublicViewOptions,
  ) {
    const { tenant, tenantDb } = await this.resolveTenantDb(options.tenantHost);
    const built = await this.warehouseSlipPdfService.buildSlipBySource(
      tenantDb,
      sourceType,
      sourceId,
    );
    const business = await this.loadBusiness(tenantDb, built.businessId);
    const design = await this.resolveDesign(tenantDb, business.id, tenant.id);
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);

    const slip = {
      ...built.slip,
      documentDate: formatDocumentDate(built.slip.documentDate),
      sourceType: built.sourceType,
      sourceId: built.sourceId,
    };

    const warehouseKind =
      `warehouse-slip/${built.sourceType}` as PublicDocumentViewKind;
    const html = await this.documentTemplateRendererService.render(
      tenantDb,
      business.id,
      DocumentTemplateDocumentType.WAREHOUSE_SLIP,
      {
        slip,
        warehouseSlip: slip,
        companyInfo: this.companyInfo(business, logoDataUri),
        ...slip,
      },
      tenant.id,
      options.clientIp,
      undefined,
      buildPublicDocumentViewUrl(warehouseKind, built.sourceId, tenant.name),
    );

    return this.wrapResponse(
      'WAREHOUSE_SLIP',
      tenant,
      business,
      design,
      slip,
      html,
    );
  }

  private wrapResponse(
    documentType:
      | 'SALE_ORDER'
      | 'SALE_INVOICE'
      | 'PURCHASE_ORDER'
      | 'PURCHASE_INVOICE'
      | 'WAREHOUSE_SLIP',
    tenant: Pick<Tenant, 'code' | 'name'>,
    business: PublicBusiness,
    design: PublicDesign,
    data: unknown,
    html: string,
  ) {
    return {
      documentType,
      tenant: { code: tenant.code, name: tenant.name },
      business,
      design,
      html,
      data,
    };
  }

  private companyInfo(business: PublicBusiness, logoDataUri: string | null) {
    return {
      name: business.name,
      legalName: business.legalName,
      address: business.address,
      phone: business.phone,
      mobile: business.phone,
      currency: business.currency,
      logo: logoDataUri,
    };
  }

  private async resolveDesign(
    tenantDb: DataSource,
    businessId: string,
    tenantId: string,
  ): Promise<PublicDesign> {
    const settings = await tenantDb.getRepository(BusinessSettings).findOne({
      where: { businessId },
      select: { defaultDocumentTemplateId: true },
    });
    let templateId = settings?.defaultDocumentTemplateId ?? null;
    if (!templateId) {
      const packs =
        await this.masterTenantDataService.getDocumentTemplatesByTenantId(
          tenantId,
        );
      const preferred = packs.find((pack) => pack.isDefault) || packs[0];
      templateId = preferred?.id ?? null;
    }
    if (!templateId) {
      throw new NotFoundException(
        'No document template is selected for this business',
      );
    }

    const pack = await this.documentTemplateRepository.findOne({
      where: { id: templateId, status: DocumentTemplateStatus.ACTIVE },
      select: { id: true, name: true, code: true },
    });
    if (!pack) {
      throw new NotFoundException(
        'The selected document template is not active',
      );
    }

    return {
      templateId: pack.id,
      templateName: pack.name,
      templateCode: pack.code,
    };
  }

  private async resolveTenantDb(tenantHost: string | undefined) {
    const tenantName = this.extractTenantName(tenantHost);
    if (!tenantName) {
      throw new NotFoundException('Tenant not found');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { name: tenantName, isActive: true },
      select: { id: true, code: true, name: true, status: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (tenant.status !== TenantStatus.PROVISIONED) {
      throw new ForbiddenException(
        `Tenant is not available (status: ${tenant.status})`,
      );
    }

    const tenantDb = await this.tenantConnectionManager.getConnection(
      tenant.id,
    );
    return { tenant, tenantDb };
  }

  private extractTenantName(host?: string): string | null {
    if (!host?.trim()) {
      return null;
    }
    const domain = (process.env.DOMAIN || '').toLowerCase();
    const h = host.trim().toLowerCase().split(':')[0];
    if (h.endsWith('.localhost')) {
      return h.split('.')[0] || null;
    }
    if (domain && h.endsWith(`.${domain}`)) {
      const sub = h.slice(0, -(domain.length + 1));
      return sub.split('.')[0] || null;
    }
    return null;
  }

  private async loadBusiness(
    tenantDb: DataSource,
    businessId: string,
  ): Promise<PublicBusiness> {
    const business = await tenantDb.getRepository(Business).findOne({
      where: { id: businessId, deletedAt: IsNull() },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return {
      id: business.id,
      code: business.code,
      name: business.name,
      legalName: business.legalName,
      logo: business.logo,
      currency: business.currency,
      phone: business.phone,
      address: business.address,
    };
  }

  private mapParty(party?: Party | null): PublicParty | null {
    if (!party) {
      return null;
    }
    return {
      id: party.id,
      code: party.code,
      name: party.name,
      phone: party.phone,
      email: party.email,
      address: party.address,
      ntnNumber: party.ntnNumber,
      strnNumber: party.strnNumber,
    };
  }
}
