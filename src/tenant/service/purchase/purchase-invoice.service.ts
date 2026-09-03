import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, IsNull } from 'typeorm';
import { Grn, GrnItem, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
} from 'src/tenant-db/entities/purchase-invoice.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { ActivityLogService } from '../activity-log.service';
import {
  ListAnalyticsModule,
  ListAnalyticsService,
} from '../list-analytics.service';
import { MasterGeoHelperService } from '../master-geo-helper.service';
import {
  PdfLogoService,
  PdfRendererService,
  safePdfFilenamePart,
} from 'src/common/pdf';
import { Business } from 'src/tenant-db/entities/business.entity';
import { buildPurchaseInvoicePdfHtml } from './purchase-invoice-pdf.template';

const INVOICE_NUMBER_PREFIX = 'PI';

type VendorGeoNames = {
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
};

type VendorBalanceSnapshot = {
  previousBalance: number;
  currentBalance: number;
};

@Injectable()
export class PurchaseInvoiceService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
    private readonly listAnalyticsService: ListAnalyticsService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private invoiceRelations() {
    return {
      grn: true,
      purchaseOrder: true,
      items: {
        product: true,
        uom: true,
      },
    } as const;
  }

  private async generateInvoiceNumber(
    manager: EntityManager,
  ): Promise<string> {
    const last = await manager
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .where('invoice.invoiceNumber LIKE :prefix', {
        prefix: `${INVOICE_NUMBER_PREFIX}-%`,
      })
      .orderBy('invoice.invoiceNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.invoiceNumber.replace(
        `${INVOICE_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${INVOICE_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private mapVendor(
    invoice: PurchaseInvoice,
    options?: {
      vendorGeoNames?: VendorGeoNames;
      vendorBalance?: VendorBalanceSnapshot | null;
    },
  ) {
    if (!invoice.vendor) {
      return null;
    }

    return {
      id: invoice.vendor.id,
      code: invoice.vendor.code,
      name: invoice.vendor.name,
      address: invoice.vendor.address,
      email: invoice.vendor.email,
      phone: invoice.vendor.phone,
      countryId: invoice.vendor.countryId,
      stateId: invoice.vendor.stateId,
      cityId: invoice.vendor.cityId,
      countryName: options?.vendorGeoNames?.countryName ?? null,
      stateName: options?.vendorGeoNames?.stateName ?? null,
      cityName: options?.vendorGeoNames?.cityName ?? null,
      previousBalance: options?.vendorBalance?.previousBalance ?? null,
      currentBalance: options?.vendorBalance?.currentBalance ?? null,
    };
  }

  private async getVendorGeoNames(
    invoice: PurchaseInvoice,
  ): Promise<VendorGeoNames> {
    const vendor = invoice.vendor;
    const [countryName, stateName, cityName] = await Promise.all([
      this.masterGeoHelperService.getCountryNameById(vendor?.countryId),
      this.masterGeoHelperService.getStateNameById(vendor?.stateId),
      this.masterGeoHelperService.getCityNameById(vendor?.cityId),
    ]);

    return { countryName, stateName, cityName };
  }

  private async getVendorBalanceSnapshot(
    tenantDb: DataSource,
    businessId: string,
    invoice: PurchaseInvoice,
  ): Promise<VendorBalanceSnapshot | null> {
    if (!invoice.vendor?.payableAccountId) {
      return null;
    }

    const transaction = await tenantDb.getRepository(Transaction).findOne({
      where: {
        businessId,
        chartOfAccountId: invoice.vendor.payableAccountId,
        referenceType: AccountTransactionReferenceType.GRN,
        referenceId: invoice.grnId,
      },
      order: {
        transactionDate: 'DESC',
        createdAt: 'DESC',
        id: 'DESC',
      },
      select: [
        'id',
        'debitAmount',
        'creditAmount',
        'currentBalance',
        'transactionDate',
        'createdAt',
      ],
    });

    if (!transaction) {
      return null;
    }

    const debitAmount = Number(transaction.debitAmount ?? 0);
    const creditAmount = Number(transaction.creditAmount ?? 0);
    const currentBalance = this.roundAmount(
      Number(transaction.currentBalance ?? 0),
    );

    return {
      previousBalance: this.roundAmount(
        currentBalance - creditAmount + debitAmount,
      ),
      currentBalance,
    };
  }

  private mapPurchaseInvoice(
    invoice: PurchaseInvoice,
    options?: {
      vendorGeoNames?: VendorGeoNames;
      vendorBalance?: VendorBalanceSnapshot | null;
    },
  ) {
    const vendor = this.mapVendor(invoice, options);
    const items = (invoice.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            skuCode: item.product.skuCode,
          }
        : null,
      productFlavourId: item.productFlavourId,
      productFlavour: item.productFlavour
        ? {
            id: item.productFlavour.id,
            flavourId: item.productFlavour.flavourId,
            flavour: item.productFlavour.flavour
              ? {
                  id: item.productFlavour.flavour.id,
                  name: item.productFlavour.flavour.name,
                }
              : null,
          }
        : null,
      vendorId: invoice.vendorId,
      vendor,
      uomId: item.uomId,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : null,
      quantity: item.quantity,
      purchaseUnitPrice: item.purchaseUnitPrice,
      discountPercentage: item.discountPercentage,
      discountAmount: item.discountAmount,
      taxPercentage: item.taxPercentage,
      taxAmount: item.taxAmount,
      totalAmount: item.totalAmount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return {
      id: invoice.id,
      businessId: invoice.businessId,
      grnId: invoice.grnId,
      grn: invoice.grn
        ? {
            id: invoice.grn.id,
            grnNumber: invoice.grn.grnNumber,
            grnDate: invoice.grn.grnDate,
            status: invoice.grn.status,
          }
        : null,
      vendorId: invoice.vendorId,
      vendor,
      vendorBalance: options?.vendorBalance ?? null,
      purchaseOrderId: invoice.purchaseOrderId,
      purchaseOrder: invoice.purchaseOrder
        ? {
            id: invoice.purchaseOrder.id,
            orderNumber: invoice.purchaseOrder.orderNumber,
          }
        : null,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalTaxAmount: invoice.totalTaxAmount,
      totalDiscountAmount: invoice.totalDiscountAmount,
      totalAmount: invoice.totalAmount,
      items,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  /**
   * Creates a purchase invoice from an approved GRN. Idempotent per GRN.
   * Called from GrnService on approval (must run inside the same transaction).
   */
  async createFromGrn(
    manager: EntityManager,
    grn: Grn,
  ): Promise<PurchaseInvoice> {
    if (grn.status !== GrnStatus.APPROVED) {
      throw new BadRequestException(
        'Purchase invoice can only be created from an approved GRN',
      );
    }

    const invoiceRepo = manager.getRepository(PurchaseInvoice);
    const existing = await invoiceRepo.findOne({
      where: { grnId: grn.id, deletedAt: IsNull() },
      relations: this.invoiceRelations(),
    });
    if (existing) {
      return existing;
    }

    const items = grn.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'GRN must have items to create a purchase invoice',
      );
    }

    const invoiceNumber = await this.generateInvoiceNumber(manager);
    const invoice = await invoiceRepo.save(
      invoiceRepo.create({
        businessId: grn.businessId,
        grnId: grn.id,
        purchaseOrderId: grn.purchaseOrderId,
        vendorId: grn.vendorId,
        invoiceNumber,
        invoiceDate: grn.grnDate,
        totalTaxAmount: grn.totalTaxAmount,
        totalDiscountAmount: grn.totalDiscountAmount,
        totalAmount: grn.totalAmount,
      }),
    );

    const itemRepo = manager.getRepository(PurchaseInvoiceItem);
    await itemRepo.save(
      items
        .filter((line) => line.receivedQuantity > 0)
        .map((line) =>
          itemRepo.create({
            purchaseInvoiceId: invoice.id,
            productId: line.productId,
            uomId: line.uomId,
            quantity: line.receivedQuantity,
            purchaseUnitPrice: line.purchaseUnitPrice,
            discountPercentage: line.discountPercentage,
            discountAmount: line.discountAmount,
            taxPercentage: line.taxPercentage,
            taxAmount: line.taxAmount,
            totalAmount: line.totalAmount,
          }),
        ),
    );

    return invoiceRepo.findOneOrFail({
      where: { id: invoice.id },
      relations: this.invoiceRelations(),
    });
  }

  /**
   * Updates an existing purchase invoice from an approved GRN after PO financial edit.
   */
  async syncFromGrn(manager: EntityManager, grn: Grn): Promise<PurchaseInvoice | null> {
    if (grn.status !== GrnStatus.APPROVED) {
      return null;
    }

    const invoiceRepo = manager.getRepository(PurchaseInvoice);
    const invoice = await invoiceRepo.findOne({
      where: { grnId: grn.id, deletedAt: IsNull() },
      relations: { items: true },
    });

    if (!invoice) {
      return null;
    }

    const freshGrnItems = await manager.getRepository(GrnItem).find({
      where: { grnId: grn.id },
    });
    const grnItems = freshGrnItems.filter(
      (line) => Number(line.receivedQuantity) > 0,
    );
    const grnItemByKey = new Map(
      grnItems.map((line) => [
        `${line.productId}:${line.uomId}:${line.productFlavourId ?? ''}`,
        line,
      ]),
    );

    await invoiceRepo.update(invoice.id, {
      invoiceDate: grn.grnDate,
      totalTaxAmount: Number(grn.totalTaxAmount),
      totalDiscountAmount: Number(grn.totalDiscountAmount),
      totalAmount: Number(grn.totalAmount),
    });

    const itemRepo = manager.getRepository(PurchaseInvoiceItem);
    for (const invoiceItem of invoice.items ?? []) {
      const key = `${invoiceItem.productId}:${invoiceItem.uomId}:${invoiceItem.productFlavourId ?? ''}`;
      const grnLine = grnItemByKey.get(key);
      if (!grnLine) {
        continue;
      }

      await itemRepo.update(invoiceItem.id, {
        productFlavourId: grnLine.productFlavourId,
        quantity: grnLine.receivedQuantity,
        purchaseUnitPrice: Number(grnLine.purchaseUnitPrice),
        discountPercentage: Number(grnLine.discountPercentage),
        discountAmount: Number(grnLine.discountAmount),
        taxPercentage: Number(grnLine.taxPercentage),
        taxAmount: Number(grnLine.taxAmount),
        totalAmount: Number(grnLine.totalAmount),
      });
    }

    return invoiceRepo.findOneOrFail({
      where: { id: invoice.id },
      relations: this.invoiceRelations(),
    });
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      grnId?: string;
      purchaseOrderId?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.grn', 'grn')
      .leftJoinAndSelect('invoice.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .where('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL');

    if (options.grnId) {
      qb.andWhere('invoice.grnId = :grnId', { grnId: options.grnId });
    }
    if (options.purchaseOrderId) {
      qb.andWhere('invoice.purchaseOrderId = :purchaseOrderId', {
        purchaseOrderId: options.purchaseOrderId,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('invoice.invoiceNumber ILIKE :search', { search })
            .orWhere('grn.grnNumber ILIKE :search', { search })
            .orWhere('purchaseOrder.orderNumber ILIKE :search', { search })
            .orWhere('vendor.name ILIKE :search', { search })
            .orWhere('vendor.code ILIKE :search', { search });
        }),
      );
    }

    const [[invoices, total], analytics] = await Promise.all([
      qb
        .orderBy('invoice.invoiceDate', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount(),
      this.listAnalyticsService.getDocumentAnalytics(
        tenantDb,
        scopedBusinessId,
        ListAnalyticsModule.PURCHASE_INVOICE,
      ),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_INVOICE_LISTED',
      description: 'Purchase invoices listed',
      metadata: { total, page, limit },
    });

    return {
      data: invoices.map((invoice) => this.mapPurchaseInvoice(invoice)),
      meta: { total, page, limit },
      analytics,
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    invoiceId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const invoice = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.grn', 'grn')
      .leftJoinAndSelect('invoice.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    const [vendorGeoNames, vendorBalance] = await Promise.all([
      this.getVendorGeoNames(invoice),
      this.getVendorBalanceSnapshot(tenantDb, scopedBusinessId, invoice),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_INVOICE_VIEWED',
      description: `Purchase invoice ${invoice.invoiceNumber} viewed`,
      metadata: { purchaseInvoiceId: invoice.id },
    });

    return {
      data: this.mapPurchaseInvoice(invoice, {
        vendorGeoNames,
        vendorBalance,
      }),
    };
  }

  async generatePdf(
    tenantDb: DataSource,
    businessId: string | undefined,
    invoiceId: string,
    actorUserId: string,
    showBalanceDetails = true,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const invoice = await tenantDb
      .getRepository(PurchaseInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.grn', 'grn')
      .leftJoinAndSelect('invoice.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('invoice.vendor', 'vendor')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    const [vendorGeoNames, vendorBalance, business] = await Promise.all([
      this.getVendorGeoNames(invoice),
      this.getVendorBalanceSnapshot(tenantDb, scopedBusinessId, invoice),
      tenantDb.getRepository(Business).findOne({
        where: { id: scopedBusinessId },
      }),
    ]);

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const mappedInvoice = this.mapPurchaseInvoice(invoice, {
      vendorGeoNames,
      vendorBalance,
    });
    const logoDataUri = await this.pdfLogoService.fetchLogoDataUri(business.logo);
    const html = buildPurchaseInvoicePdfHtml(
      mappedInvoice,
      {
        name: business.name,
        legalName: business.legalName,
        address: business.address,
        phone: business.phone,
        currency: business.currency,
      },
      logoDataUri,
      showBalanceDetails,
    );
    const buffer = await this.pdfRendererService.renderHtmlToPdf({
      html,
      // Invoice content can legitimately span pages when the line items or
      // party details are long. Let Chromium paginate it like frontend print.
      enforceSinglePage: false,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_INVOICE_PDF_DOWNLOADED',
      description: `Purchase invoice ${invoice.invoiceNumber} PDF downloaded`,
      metadata: { purchaseInvoiceId: invoice.id },
    });

    return {
      buffer,
      filename: `${safePdfFilenamePart(invoice.invoiceNumber)}.pdf`,
    };
  }
}
