import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  DocumentTemplate,
  DocumentTemplateStatus,
} from 'src/master-db/entities/document-template.entity';
import {
  findActiveInlineDocumentTemplateItem,
  shouldUseCustomDocumentTemplatePack,
} from 'src/master-db/helpers/document-template.helper';
import {
  DocumentTemplateDocumentType,
  DocumentTemplateItem,
} from 'src/master-db/entities/document-template-item.entity';
import {
  DeliveryNote,
  DeliveryNoteItem,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
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
import { buildSaleInvoicePdfHtml } from './sale-invoice-pdf.template';
import { Business } from 'src/tenant-db/entities/business.entity';
import { BusinessSettings } from 'src/tenant-db/entities/business-settings.entity';
import {
  endOfDay,
  parseDateRange,
  startOfDay,
} from '../report/report-query.helper';
import { PrintThemeService } from '../print-theme.service';

const INVOICE_NUMBER_PREFIX = 'SI';

type CustomerGeoNames = {
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
};

type CustomerBalanceSnapshot = {
  previousBalance: number;
  currentBalance: number;
};

@Injectable()
export class SaleInvoiceService {
  constructor(
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplateRepository: Repository<DocumentTemplate>,
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
    private readonly listAnalyticsService: ListAnalyticsService,
    private readonly pdfRendererService: PdfRendererService,
    private readonly pdfLogoService: PdfLogoService,
    private readonly printThemeService: PrintThemeService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async getBusinessSaleInvoiceTemplate(
    tenantDb: DataSource,
    businessId: string,
  ): Promise<DocumentTemplateItem | null> {
    const settings = await tenantDb.getRepository(BusinessSettings).findOne({
      where: { businessId },
      select: ['defaultDocumentTemplateId'],
    });
    if (!settings?.defaultDocumentTemplateId) return null;

    const pack = await this.documentTemplateRepository.findOne({
      where: {
        id: settings.defaultDocumentTemplateId,
        status: DocumentTemplateStatus.ACTIVE,
      },
      relations: { items: true },
    });

    if (!shouldUseCustomDocumentTemplatePack(pack)) return null;

    return findActiveInlineDocumentTemplateItem(
      pack.items,
      DocumentTemplateDocumentType.SALE_INVOICE,
    );
  }

  private renderDocumentTemplateHtml(
    content: string,
    data: Record<string, unknown>,
  ): string {
    const escapeHtml = (value: unknown) =>
      String(value).replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        };
        return entities[character];
      });

    const readPath = (path: string, scope: Record<string, unknown>) =>
      path.split('.').reduce<unknown>((current, key) => {
        if (!current || typeof current !== 'object') return undefined;
        return (current as Record<string, unknown>)[key];
      }, scope);

    const interpolate = (
      markup: string,
      scope: Record<string, unknown>,
      itemIndex: number | null = null,
    ) => markup.replace(
      /\{\{\s*(@index|[a-zA-Z0-9_.]+)\s*\}\}/g,
      (_match, path: string) => {
        if (path === '@index') {
          return itemIndex == null ? '' : String(itemIndex);
        }
        const value = path.split('.').reduce<unknown>((current, key) => {
          if (!current || typeof current !== 'object') return undefined;
          return (current as Record<string, unknown>)[key];
        }, scope);
        return value == null ? '' : escapeHtml(value);
      },
    );

    const eachBlocks: Array<{ path: string; rowMarkup: string }> = [];
    const withEachMarkers = content.replace(
      /\{\{#each\s+([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match, path: string, rowMarkup: string) => {
        const index = eachBlocks.push({ path, rowMarkup }) - 1;
        return `\u0000DOCUMENT_TEMPLATE_EACH_${index}\u0000`;
      },
    );

    const interpolatedMarkup = interpolate(withEachMarkers, data);
    const filledContent = interpolatedMarkup.replace(
      /\u0000DOCUMENT_TEMPLATE_EACH_(\d+)\u0000/g,
      (_marker, blockIndex: string) => {
        const block = eachBlocks[Number(blockIndex)];
        const rows = block ? readPath(block.path, data) : null;
        if (!block || !Array.isArray(rows)) return '';
        return rows.map((row: unknown, index: number) => {
          const rowData = row && typeof row === 'object'
            ? row as Record<string, unknown>
            : { value: row };
          return interpolate(
            block.rowMarkup,
            { ...data, ...rowData, item: row, this: row, lineNumber: index + 1 },
            index,
          );
        }).join('');
      },
    );

    if (/<html[\s>]/i.test(filledContent)) return filledContent;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@page{size:A4;margin:0}html,body{margin:0;min-height:100%;background:#fff;font-family:Arial,sans-serif}</style></head><body>${filledContent}</body></html>`;
  }

  private formatDocumentTemplateDate(value: Date | string | null | undefined): string {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map(({ type, value: partValue }) => [type, partValue]),
    );
    return `${values.month}/${values.day}/${values.year}`;
  }

  private invoiceRelations() {
    return {
      deliveryNote: true,
      saleOrder: true,
      customer: true,
      items: {
        product: true,
        uom: true,
        productFlavour: { flavour: true },
        warehouse: true,
      },
    } as const;
  }

  private async generateInvoiceNumber(
    manager: EntityManager,
  ): Promise<string> {
    const last = await manager
      .getRepository(SaleInvoice)
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

  private mapCustomer(
    invoice: SaleInvoice,
    options?: {
      customerGeoNames?: CustomerGeoNames;
      customerBalance?: CustomerBalanceSnapshot | null;
    },
  ) {
    if (!invoice.customer) {
      return null;
    }

    return {
      id: invoice.customer.id,
      code: invoice.customer.code,
      name: invoice.customer.name,
      address: invoice.customer.address,
      email: invoice.customer.email,
      phone: invoice.customer.phone,
      countryId: invoice.customer.countryId,
      stateId: invoice.customer.stateId,
      cityId: invoice.customer.cityId,
      countryName: options?.customerGeoNames?.countryName ?? null,
      stateName: options?.customerGeoNames?.stateName ?? null,
      cityName: options?.customerGeoNames?.cityName ?? null,
      previousBalance: options?.customerBalance?.previousBalance ?? null,
      currentBalance: options?.customerBalance?.currentBalance ?? null,
    };
  }

  private async getCustomerGeoNames(
    invoice: SaleInvoice,
  ): Promise<CustomerGeoNames> {
    const customer = invoice.customer;
    const [countryName, stateName, cityName] = await Promise.all([
      this.masterGeoHelperService.getCountryNameById(customer?.countryId),
      this.masterGeoHelperService.getStateNameById(customer?.stateId),
      this.masterGeoHelperService.getCityNameById(customer?.cityId),
    ]);

    return { countryName, stateName, cityName };
  }

  private async getCustomerBalanceSnapshot(
    tenantDb: DataSource,
    businessId: string,
    invoice: SaleInvoice,
  ): Promise<CustomerBalanceSnapshot | null> {
    if (!invoice.customer?.receivableAccountId) {
      return null;
    }

    const transaction = await tenantDb.getRepository(Transaction).findOne({
      where: {
        businessId,
        chartOfAccountId: invoice.customer.receivableAccountId,
        referenceType: AccountTransactionReferenceType.DELIVERY_NOTE,
        referenceId: invoice.deliveryNoteId,
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
        currentBalance - debitAmount + creditAmount,
      ),
      currentBalance,
    };
  }

  private mapSaleInvoice(
    invoice: SaleInvoice,
    options?: {
      customerGeoNames?: CustomerGeoNames;
      customerBalance?: CustomerBalanceSnapshot | null;
    },
  ) {
    const customer = this.mapCustomer(invoice, options);
    const items = (invoice.items ?? []).map((item) => ({
      id: item.id,
      warehouseId: item.warehouseId,
      warehouse: item.warehouse
        ? {
            id: item.warehouse.id,
            code: item.warehouse.code,
            name: item.warehouse.name,
          }
        : null,
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
      customerId: invoice.customerId,
      customer,
      uomId: item.uomId,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : null,
      quantity: item.quantity,
      saleUnitPrice: item.saleUnitPrice,
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
      deliveryNoteId: invoice.deliveryNoteId,
      deliveryNote: invoice.deliveryNote
        ? {
            id: invoice.deliveryNote.id,
            deliveryNoteNumber: invoice.deliveryNote.deliveryNoteNumber,
            deliveryNoteDate: invoice.deliveryNote.deliveryNoteDate,
            status: invoice.deliveryNote.status,
            deliveryCost: Number(invoice.deliveryNote.deliveryCost ?? 0),
          }
        : null,
      customerId: invoice.customerId,
      customer,
      customerBalance: options?.customerBalance ?? null,
      saleOrderId: invoice.saleOrderId,
      saleOrder: invoice.saleOrder
        ? {
            id: invoice.saleOrder.id,
            orderNumber: invoice.saleOrder.orderNumber,
            deliveryCost: Number(invoice.saleOrder.deliveryCost ?? 0),
          }
        : null,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      deliveryCost: Number(
        invoice.deliveryNote?.deliveryCost ??
          invoice.saleOrder?.deliveryCost ??
          0,
      ),
      totalTaxAmount: invoice.totalTaxAmount,
      totalDiscountAmount: invoice.totalDiscountAmount,
      totalAmount: invoice.totalAmount,
      items,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };
  }

  /**
   * Creates a sale invoice from an approved delivery note. Idempotent per delivery note.
   * Called from DeliveryNoteService on approval (must run inside the same transaction).
   */
  async createFromDeliveryNote(
    manager: EntityManager,
    deliveryNote: DeliveryNote,
  ): Promise<SaleInvoice> {
    if (deliveryNote.status !== DeliveryNoteStatus.APPROVED) {
      throw new BadRequestException(
        'Sale invoice can only be created from an approved delivery note',
      );
    }

    const invoiceRepo = manager.getRepository(SaleInvoice);
    const existing = await invoiceRepo.findOne({
      where: { deliveryNoteId: deliveryNote.id, deletedAt: IsNull() },
      relations: this.invoiceRelations(),
    });
    if (existing) {
      return existing;
    }

    const items = deliveryNote.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Delivery note must have items to create a sale invoice',
      );
    }

    const invoiceNumber = await this.generateInvoiceNumber(manager);
    const invoice = await invoiceRepo.save(
      invoiceRepo.create({
        businessId: deliveryNote.businessId,
        deliveryNoteId: deliveryNote.id,
        saleOrderId: deliveryNote.saleOrderId,
        customerId: deliveryNote.customerId,
        invoiceNumber,
        invoiceDate: deliveryNote.deliveryNoteDate,
        totalTaxAmount: deliveryNote.totalTaxAmount,
        totalDiscountAmount: deliveryNote.totalDiscountAmount,
        totalAmount: deliveryNote.totalAmount,
      }),
    );

    const itemRepo = manager.getRepository(SaleInvoiceItem);
    await itemRepo.save(
      items
        .filter((line) => line.deliveredQuantity > 0)
        .map((line) =>
          itemRepo.create({
            saleInvoiceId: invoice.id,
            warehouseId: line.warehouseId,
            productId: line.productId,
            uomId: line.uomId,
            productFlavourId: line.productFlavourId ?? null,
            quantity: line.deliveredQuantity,
            saleUnitPrice: line.saleUnitPrice,
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
   * Updates an existing sale invoice from an approved delivery note after SO financial edit.
   */
  async syncFromDeliveryNote(
    manager: EntityManager,
    deliveryNote: DeliveryNote,
  ): Promise<SaleInvoice | null> {
    if (deliveryNote.status !== DeliveryNoteStatus.APPROVED) {
      return null;
    }

    const invoiceRepo = manager.getRepository(SaleInvoice);
    const invoice = await invoiceRepo.findOne({
      where: { deliveryNoteId: deliveryNote.id, deletedAt: IsNull() },
      relations: { items: true },
    });

    if (!invoice) {
      return null;
    }

    const freshDnItems = await manager.getRepository(DeliveryNoteItem).find({
      where: { deliveryNoteId: deliveryNote.id },
    });
    const dnItems = freshDnItems.filter(
      (line) => Number(line.deliveredQuantity) > 0,
    );
    const dnItemByKey = new Map(
      dnItems.map((line) => [
        `${line.productId}:${line.uomId}:${line.productFlavourId ?? ''}:${line.warehouseId}`,
        line,
      ]),
    );

    await invoiceRepo.update(invoice.id, {
      invoiceDate: deliveryNote.deliveryNoteDate,
      totalTaxAmount: Number(deliveryNote.totalTaxAmount),
      totalDiscountAmount: Number(deliveryNote.totalDiscountAmount),
      totalAmount: Number(deliveryNote.totalAmount),
    });

    const itemRepo = manager.getRepository(SaleInvoiceItem);
    for (const invoiceItem of invoice.items ?? []) {
      const key = `${invoiceItem.productId}:${invoiceItem.uomId}:${invoiceItem.productFlavourId ?? ''}:${invoiceItem.warehouseId}`;
      const dnLine = dnItemByKey.get(key);
      if (!dnLine) {
        continue;
      }

      await itemRepo.update(invoiceItem.id, {
        productFlavourId: dnLine.productFlavourId,
        quantity: dnLine.deliveredQuantity,
        saleUnitPrice: Number(dnLine.saleUnitPrice),
        discountPercentage: Number(dnLine.discountPercentage),
        discountAmount: Number(dnLine.discountAmount),
        taxPercentage: Number(dnLine.taxPercentage),
        taxAmount: Number(dnLine.taxAmount),
        totalAmount: Number(dnLine.totalAmount),
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
      deliveryNoteId?: string;
      saleOrderId?: string;
      startDate?: string;
      endDate?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;
    const { startDate: parsedStartDate, endDate: parsedEndDate } =
      parseDateRange(options.startDate, options.endDate);

    const qb = tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .where('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL');

    if (options.deliveryNoteId) {
      qb.andWhere('invoice.deliveryNoteId = :deliveryNoteId', {
        deliveryNoteId: options.deliveryNoteId,
      });
    }
    if (options.saleOrderId) {
      qb.andWhere('invoice.saleOrderId = :saleOrderId', {
        saleOrderId: options.saleOrderId,
      });
    }
    if (parsedStartDate) {
      qb.andWhere('invoice.invoiceDate >= :startDate', {
        startDate: startOfDay(parsedStartDate),
      });
    }
    if (parsedEndDate) {
      qb.andWhere('invoice.invoiceDate <= :endDate', {
        endDate: endOfDay(parsedEndDate),
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('invoice.invoiceNumber ILIKE :search', { search })
            .orWhere('deliveryNote.deliveryNoteNumber ILIKE :search', {
              search,
            })
            .orWhere('saleOrder.orderNumber ILIKE :search', { search })
            .orWhere('customer.name ILIKE :search', { search })
            .orWhere('customer.code ILIKE :search', { search });
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
        ListAnalyticsModule.SALE_INVOICE,
      ),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_INVOICE_LISTED',
      description: 'Sale invoices listed',
      metadata: { total, page, limit },
    });

    return {
      data: invoices.map((invoice) => this.mapSaleInvoice(invoice)),
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
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }

    const [customerGeoNames, customerBalance] = await Promise.all([
      this.getCustomerGeoNames(invoice),
      this.getCustomerBalanceSnapshot(tenantDb, scopedBusinessId, invoice),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_INVOICE_VIEWED',
      description: `Sale invoice ${invoice.invoiceNumber} viewed`,
      metadata: { saleInvoiceId: invoice.id },
    });

    return {
      data: this.mapSaleInvoice(invoice, {
        customerGeoNames,
        customerBalance,
      }),
    };
  }

  async generatePdf(
    tenantDb: DataSource,
    businessId: string | undefined,
    invoiceId: string,
    actorUserId: string,
    showBalanceDetails = true,
    tenantId?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const invoice = await tenantDb
      .getRepository(SaleInvoice)
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('invoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('invoice.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .leftJoinAndSelect('invoice.customer', 'customer')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('invoice.deletedAt IS NULL')
      .getOne();

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }

    const [
      customerGeoNames,
      customerBalance,
      business,
      selectedSaleInvoiceTemplate,
    ] = await Promise.all([
      this.getCustomerGeoNames(invoice),
      this.getCustomerBalanceSnapshot(tenantDb, scopedBusinessId, invoice),
      tenantDb.getRepository(Business).findOne({
        where: { id: scopedBusinessId },
      }),
      this.getBusinessSaleInvoiceTemplate(tenantDb, scopedBusinessId),
    ]);

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const mappedInvoice = this.mapSaleInvoice(invoice, {
      customerGeoNames,
      customerBalance,
    });
    const [logoDataUri, theme] = await Promise.all([
      this.pdfLogoService.fetchLogoDataUri(business.logo),
      this.printThemeService.resolveForTenant(tenantId),
    ]);
    const templateInvoice = {
      ...mappedInvoice,
      invoice_no: mappedInvoice.invoiceNumber,
      invoice_date: this.formatDocumentTemplateDate(mappedInvoice.invoiceDate),
      vendor_code: mappedInvoice.customer?.code ?? '',
      vendor_name: mappedInvoice.customer?.name ?? '',
      vendor_address: mappedInvoice.customer?.address ?? '',
      vendor_city: mappedInvoice.customer?.cityName ?? '',
      total: mappedInvoice.totalAmount,
      total_tax: mappedInvoice.totalTaxAmount,
      total_discount: mappedInvoice.totalDiscountAmount,
      delivery_cost: mappedInvoice.deliveryCost,
      previous_balance: showBalanceDetails
        ? mappedInvoice.customerBalance?.previousBalance ?? 0
        : '',
      current_balance: showBalanceDetails
        ? mappedInvoice.customerBalance?.currentBalance ?? 0
        : '',
      items: mappedInvoice.items.map((item) => {
        const quantity = Number(item.quantity ?? 0);
        const unitPrice = Number(item.saleUnitPrice ?? 0);
        const discountPercentage = Number(item.discountPercentage ?? 0);
        const discountAmount = Number(item.discountAmount ?? 0);
        const hasDiscountAmount =
          item.discountAmount !== null && item.discountAmount !== undefined;
        const discountedUnitPrice =
          quantity > 0 && hasDiscountAmount
            ? Math.max(0, unitPrice - discountAmount / quantity)
            : Math.max(0, unitPrice * (1 - discountPercentage / 100));

        return {
          ...item,
          product_id: item.product?.skuCode || item.productId || item.product?.id || '',
          product_name: item.product?.name || '',
          product: {
            ...item.product,
            id: item.product?.skuCode || item.productId || '',
            title: item.product?.name || '',
          },
          measurement_unit: item.uom?.name || '',
          unit_price: unitPrice,
          discount: discountPercentage || discountAmount,
          discount_amount: discountAmount,
          discounted_unit_price: discountedUnitPrice,
          discount_in_percentage: discountPercentage > 0 ? 1 : 0,
          total: Number(item.totalAmount ?? 0),
        };
      }),
    };
    const customTemplateHtml = selectedSaleInvoiceTemplate?.content
      ? this.renderDocumentTemplateHtml(selectedSaleInvoiceTemplate.content, {
          invoice: templateInvoice,
          companyInfo: {
            name: business.name,
            legalName: business.legalName,
            address: business.address,
            mobile: business.phone,
            phone: business.phone,
            currency: business.currency,
            logo: logoDataUri,
          },
          invoiceNo: mappedInvoice.invoiceNumber,
        })
      : null;
    const html = customTemplateHtml ?? buildSaleInvoicePdfHtml(
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
      new Date(),
      { theme },
    );
    const buffer = await this.pdfRendererService.renderHtmlToPdf({
      html,
      enforceSinglePage: false,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_INVOICE_PDF_DOWNLOADED',
      description: `Sale invoice ${invoice.invoiceNumber} PDF downloaded`,
      metadata: { saleInvoiceId: invoice.id },
    });

    return {
      buffer,
      filename: `${safePdfFilenamePart(invoice.invoiceNumber)}.pdf`,
    };
  }

  async softDeleteBySaleOrder(
    manager: EntityManager,
    saleOrderId: string,
  ): Promise<string[]> {
    const invoices = await manager.getRepository(SaleInvoice).find({
      where: { saleOrderId, deletedAt: IsNull() },
      select: ['id'],
    });

    if (!invoices.length) {
      return [];
    }

    const invoiceIds = invoices.map((invoice) => invoice.id);
    await manager.getRepository(SaleInvoice).softDelete(invoiceIds);
    return invoiceIds;
  }
}
