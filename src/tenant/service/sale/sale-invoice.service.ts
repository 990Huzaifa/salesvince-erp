import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, IsNull } from 'typeorm';
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
import { MasterGeoHelperService } from '../master-geo-helper.service';

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
    private readonly activityLogService: ActivityLogService,
    private readonly masterGeoHelperService: MasterGeoHelperService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
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
    if (String(deliveryNote.status) !== DeliveryNoteStatus.APPROVED) {
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
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

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
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('invoice.invoiceNumber ILIKE :search', { search })
            .orWhere('deliveryNote.deliveryNoteNumber ILIKE :search', { search })
            .orWhere('saleOrder.orderNumber ILIKE :search', { search });
        }),
      );
    }

    const [invoices, total] = await qb
      .orderBy('invoice.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

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
}
