import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Brackets, DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  SaleReturn,
  SaleReturnItem,
  SaleReturnMode,
  SaleReturnStatus,
} from 'src/tenant-db/entities/sale-return.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleOrderItem } from 'src/tenant-db/entities/sale-order.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  Product,
  ProductFlavour,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import {
  SaleItemType,
  isProductSaleItem,
  isServiceSaleItem,
} from 'src/tenant-db/entities/sale-item-type';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { CreateSaleReturnDto } from '../../dto/sale-return/create-sale-return.dto';
import { CreateSaleReturnItemDto } from '../../dto/sale-return/create-sale-return-item.dto';
import { UpdateSaleReturnDto } from '../../dto/sale-return/update-sale-return.dto';
import { BulkApproveSaleReturnsDto } from '../../dto/sale-return/bulk-approve-sale-returns.dto';
import {
  SaleReturnJsonImportDto,
  SaleReturnJsonItemDto,
} from '../../dto/sale-return/sale-return-json-export-import.dto';
import {
  JsonExportEntity,
  JsonImportMode,
  SALESVINCE_EXPORT_FORMAT,
} from '../../dto/import-export/json-export-envelope.dto';
import { ActivityLogService } from '../activity-log.service';
import {
  ListAnalyticsModule,
  ListAnalyticsService,
} from '../list-analytics.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import { StockService } from '../stock.service';
import { TransactionService } from '../transaction.service';
import {
  resolveCogsAccount,
  resolveInventoryControlAccount,
  resolveSalesRevenueAccount,
} from 'src/tenant-db/helpers/sales-revenue-chart-of-account.helper';

const RETURN_NUMBER_PREFIX = 'SRT';

type ResolvedReturnLine = {
  itemType: SaleItemType;
  serviceId: string | null;
  warehouseId: string | null;
  productId: string | null;
  uomId: string | null;
  productFlavourId: string | null;
  quantity: number;
  lineAmount: number;
  purchaseUnitPrice: number;
  saleUnitPrice: number;
};

@Injectable()
export class SaleReturnService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
    private readonly listAnalyticsService: ListAnalyticsService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private returnRelations() {
    return {
      customer: true,
      saleInvoice: {
        items: true,
        customer: true,
        deliveryNote: true,
        saleOrder: { items: true },
      },
      saleReturnItems: {
        product: true,
        service: true,
        productFlavour: { flavour: true },
        uom: true,
        warehouse: true,
      },
    } as const;
  }

  /** Matches return lines to invoice lines (itemType + serviceId for services). */
  private itemKey(item: {
    itemType?: SaleItemType | null;
    serviceId?: string | null;
    productId?: string | null;
    uomId?: string | null;
    productFlavourId?: string | null;
  }): string {
    if (isServiceSaleItem(item)) {
      return `${SaleItemType.SERVICE}:${item.serviceId ?? ''}`;
    }
    return `${SaleItemType.PRODUCT}:${item.productId ?? ''}:${item.uomId ?? ''}:${item.productFlavourId ?? ''}`;
  }

  private findSaleOrderItem(
    orderItems: SaleOrderItem[] | undefined,
    invoiceItem: SaleInvoiceItem,
  ): SaleOrderItem | undefined {
    if (isServiceSaleItem(invoiceItem)) {
      return orderItems?.find(
        (row) =>
          isServiceSaleItem(row) && row.serviceId === invoiceItem.serviceId,
      );
    }
    return orderItems?.find(
      (row) =>
        isProductSaleItem(row) &&
        row.productId === invoiceItem.productId &&
        row.uomId === invoiceItem.uomId &&
        (row.productFlavourId ?? null) === (invoiceItem.productFlavourId ?? null),
    );
  }

  /** Stock and COGS only apply to PRODUCT return lines. */
  private productLinesOnly(lines: ResolvedReturnLine[]): ResolvedReturnLine[] {
    return lines.filter((line) => isProductSaleItem(line));
  }

  private async generateReturnNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .where('saleReturn.returnNumber LIKE :prefix', {
        prefix: `${RETURN_NUMBER_PREFIX}-%`,
      })
      .orderBy('saleReturn.returnNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.returnNumber.replace(`${RETURN_NUMBER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${RETURN_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private lineAmountForQuantity(
    invoiceItem: SaleInvoiceItem,
    quantity: number,
  ): number {
    const invoicedQty = Number(invoiceItem.quantity);
    if (invoicedQty <= 0) {
      return 0;
    }
    return this.roundAmount(
      (Number(invoiceItem.totalAmount) / invoicedQty) * quantity,
    );
  }

  private async getReturnedQuantityByInvoiceItem(
    manager: EntityManager,
    saleInvoiceId: string,
    excludeReturnId?: string,
  ): Promise<Map<string, number>> {
    const returns = await manager.getRepository(SaleReturn).find({
      where: {
        saleInvoiceId,
        status: In([SaleReturnStatus.PENDING, SaleReturnStatus.APPROVED]),
      },
      relations: { saleReturnItems: true },
    });

    const invoice = await manager.getRepository(SaleInvoice).findOne({
      where: { id: saleInvoiceId },
      relations: { items: true },
    });
    if (!invoice?.items?.length) {
      return new Map();
    }

    const invoiceItemByKey = new Map(
      invoice.items.map((row) => [this.itemKey(row), row.id]),
    );

    const returned = new Map<string, number>();

    for (const saleReturn of returns) {
      if (excludeReturnId && saleReturn.id === excludeReturnId) {
        continue;
      }
      for (const line of saleReturn.saleReturnItems ?? []) {
        const invoiceItemId = invoiceItemByKey.get(this.itemKey(line));
        if (!invoiceItemId) {
          continue;
        }
        returned.set(
          invoiceItemId,
          (returned.get(invoiceItemId) ?? 0) + Number(line.quantity),
        );
      }
    }

    return returned;
  }

  private resolveCreateLines(
    invoice: SaleInvoice,
    dto: CreateSaleReturnDto,
    alreadyReturned: Map<string, number>,
  ): ResolvedReturnLine[] {
    const itemsById = new Map(
      (invoice.items ?? []).map((item) => [item.id, item]),
    );

    const resolved: ResolvedReturnLine[] = [];

    for (const line of dto.items) {
      if (!line.saleInvoiceItemId) {
        throw new BadRequestException(
          'saleInvoiceItemId is required for invoice-mode sale return items',
        );
      }
      const invoiceItem = itemsById.get(line.saleInvoiceItemId);
      if (!invoiceItem) {
        throw new BadRequestException(
          `Sale invoice item ${line.saleInvoiceItemId} not found on this invoice`,
        );
      }

      const priorReturned = alreadyReturned.get(invoiceItem.id) ?? 0;
      const maxReturnable = Number(invoiceItem.quantity) - priorReturned;
      if (line.quantity > maxReturnable) {
        throw new BadRequestException(
          `Return quantity exceeds remaining invoice quantity for ${isServiceSaleItem(invoiceItem) ? 'service' : 'product'} ${invoiceItem.serviceId ?? invoiceItem.productId}`,
        );
      }

      const orderItem = this.findSaleOrderItem(
        invoice.saleOrder?.items,
        invoiceItem,
      );
      const lineAmount = this.lineAmountForQuantity(
        invoiceItem,
        line.quantity,
      );
      const saleUnitPrice =
        line.quantity > 0
          ? this.roundAmount(lineAmount / line.quantity)
          : 0;

      const isService = isServiceSaleItem(invoiceItem);
      resolved.push({
        itemType: isService ? SaleItemType.SERVICE : SaleItemType.PRODUCT,
        serviceId: isService ? (invoiceItem.serviceId ?? null) : null,
        warehouseId: isService ? null : invoiceItem.warehouseId,
        productId: isService ? null : invoiceItem.productId,
        uomId: isService ? null : invoiceItem.uomId,
        productFlavourId: isService
          ? null
          : (invoiceItem.productFlavourId ?? null),
        quantity: line.quantity,
        lineAmount,
        purchaseUnitPrice: isService
          ? 0
          : Number(orderItem?.purchaseUnitPrice ?? 0),
        saleUnitPrice,
      });
    }

    return resolved;
  }

  private async findSaleInvoiceForReturn(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    saleInvoiceId: string,
  ): Promise<SaleInvoice> {
    const invoice = await tenantDb.getRepository(SaleInvoice).findOne({
      where: {
        id: saleInvoiceId,
        businessId,
        deletedAt: IsNull(),
      },
      relations: {
        items: true,
        customer: true,
        deliveryNote: true,
        saleOrder: { items: true },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Sale invoice not found');
    }
    if (!invoice.items?.length) {
      throw new BadRequestException(
        'Sale invoice must have items to create a return',
      );
    }

    return invoice;
  }

  private async findReturnForBusiness(
    tenantDb: DataSource,
    businessId: string,
    returnId: string,
  ): Promise<SaleReturn> {
    const saleReturn = await tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .leftJoinAndSelect('saleReturn.customer', 'returnCustomer')
      .leftJoinAndSelect('saleReturn.saleInvoice', 'saleInvoice')
      .leftJoinAndSelect('saleInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('saleInvoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('saleInvoice.customer', 'customer')
      .leftJoinAndSelect('saleInvoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('saleOrder.items', 'saleOrderItems')
      .leftJoinAndSelect('saleReturn.saleReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('saleReturn.id = :returnId', { returnId })
      .andWhere('saleReturn.businessId = :businessId', { businessId })
      .getOne();

    if (!saleReturn) {
      throw new NotFoundException('Sale return not found');
    }

    return saleReturn;
  }

  private mapSaleReturn(saleReturn: SaleReturn) {
    const invoice = saleReturn.saleInvoice;
    const customer = saleReturn.customer ?? invoice?.customer ?? null;
    const items = (saleReturn.saleReturnItems ?? []).map((item) => ({
      id: item.id,
      itemType: item.itemType ?? SaleItemType.PRODUCT,
      serviceId: item.serviceId ?? null,
      service: item.service
        ? {
            id: item.service.id,
            code: item.service.code,
            name: item.service.name,
          }
        : null,
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
      uomId: item.uomId,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : null,
      quantity: item.quantity,
      saleUnitPrice: Number(item.saleUnitPrice ?? 0),
      purchaseUnitPrice: Number(item.purchaseUnitPrice ?? 0),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const totalReturnAmount = items.reduce((sum, item) => {
      const storedSale = Number(item.saleUnitPrice ?? 0);
      if (storedSale > 0) {
        return sum + this.roundAmount(storedSale * Number(item.quantity));
      }
      const itemKey = this.itemKey(item);
      const invoiceItem = invoice?.items?.find(
        (row) => this.itemKey(row) === itemKey,
      );
      if (!invoiceItem) {
        return sum;
      }
      return sum + this.lineAmountForQuantity(invoiceItem, Number(item.quantity));
    }, 0);

    return {
      id: saleReturn.id,
      businessId: saleReturn.businessId,
      returnMode: saleReturn.returnMode ?? SaleReturnMode.INVOICE,
      saleInvoiceId: saleReturn.saleInvoiceId,
      customerId: saleReturn.customerId ?? invoice?.customerId ?? null,
      customer: customer
        ? {
            id: customer.id,
            code: customer.code,
            name: customer.name,
          }
        : null,
      saleInvoice: invoice
        ? {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            totalAmount: invoice.totalAmount,
            customerId: invoice.customerId,
            customer: invoice.customer
              ? {
                  id: invoice.customer.id,
                  code: invoice.customer.code,
                  name: invoice.customer.name,
                }
              : null,
          }
        : null,
      returnNumber: saleReturn.returnNumber,
      returnDate: saleReturn.returnDate,
      returnReason: saleReturn.returnReason,
      status: saleReturn.status,
      totalReturnAmount: this.roundAmount(totalReturnAmount),
      items,
      createdAt: saleReturn.createdAt,
      updatedAt: saleReturn.updatedAt,
    };
  }

  private assertPendingStatus(
    saleReturn: SaleReturn,
    message = 'Only pending sale returns can perform this action',
  ): void {
    if (saleReturn.status !== SaleReturnStatus.PENDING) {
      throw new BadRequestException(message);
    }
  }

  private groupLinesByWarehouse(
    lines: ResolvedReturnLine[],
  ): Map<string, ResolvedReturnLine[]> {
    const grouped = new Map<string, ResolvedReturnLine[]>();
    for (const line of this.productLinesOnly(lines)) {
      const warehouseKey = line.warehouseId as string;
      const rows = grouped.get(warehouseKey) ?? [];
      rows.push(line);
      grouped.set(warehouseKey, rows);
    }
    return grouped;
  }

  private async receiveStockForReturnLines(
    manager: EntityManager,
    businessId: string,
    customerId: string,
    saleReturn: SaleReturn,
    lines: ResolvedReturnLine[],
  ): Promise<void> {
    for (const [warehouseId, group] of this.groupLinesByWarehouse(lines)) {
      await this.stockService.receiveStockIn(manager, {
        businessId,
        warehouseId,
        vendorId: customerId,
        referenceType: ReferenceType.SALE_RETURN,
        batchDate: saleReturn.returnDate,
        batchNumberPrefix: saleReturn.returnNumber,
        lines: group.map((line) => ({
          productId: line.productId as string,
          uomId: line.uomId as string,
          quantity: line.quantity,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitPrice: line.saleUnitPrice,
        })),
      });
    }
  }

  private async consumeStockForReturnReversal(
    manager: EntityManager,
    businessId: string,
    lines: ResolvedReturnLine[],
  ): Promise<void> {
    for (const [warehouseId, group] of this.groupLinesByWarehouse(lines)) {
      await this.stockService.consumeStockOut(manager, {
        businessId,
        warehouseId,
        referenceType: ReferenceType.SALE_RETURN,
        lines: group.map((line) => ({
          productId: line.productId as string,
          uomId: line.uomId as string,
          quantity: line.quantity,
        })),
      });
    }
  }

  private async executeSaleReturnApproval(
    manager: EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
    lines: ResolvedReturnLine[],
    customer: Party,
  ): Promise<SaleReturn> {
    this.assertPendingStatus(
      saleReturn,
      'Only pending sale returns can be approved',
    );

    if (!customer?.receivableAccountId) {
      throw new BadRequestException(
        'Customer receivable account is required before approving a sale return',
      );
    }

    const totalAmount = this.roundAmount(
      lines.reduce((sum, line) => sum + line.lineAmount, 0),
    );
    if (totalAmount <= 0) {
      throw new BadRequestException(
        'Sale return total amount must be greater than zero',
      );
    }

    await this.receiveStockForReturnLines(
      manager,
      businessId,
      customer.id,
      saleReturn,
      lines,
    );

    const [salesRevenue, cogs, inventory] = await Promise.all([
      resolveSalesRevenueAccount(manager, businessId),
      resolveCogsAccount(manager, businessId),
      resolveInventoryControlAccount(manager, businessId),
    ]);
    const description = `Sale return ${saleReturn.returnNumber} - customer receivable reduced`;
    const cogsAmount = this.roundAmount(
      this.productLinesOnly(lines).reduce(
        (sum, line) =>
          sum + Number(line.quantity) * Number(line.purchaseUnitPrice ?? 0),
        0,
      ),
    );

    // Reverse sale: Cr AR / Dr Sales Revenue; Dr Inventory / Cr COGS.
    const journalLines = [
      {
        chartOfAccountId: customer.receivableAccountId,
        creditAmount: totalAmount,
        description,
      },
      {
        chartOfAccountId: salesRevenue.id,
        debitAmount: totalAmount,
        description,
      },
    ];
    if (cogsAmount > 0) {
      journalLines.push(
        {
          chartOfAccountId: inventory.id,
          debitAmount: cogsAmount,
          description,
        },
        {
          chartOfAccountId: cogs.id,
          creditAmount: cogsAmount,
          description,
        },
      );
    }

    await this.transactionService.postJournal(manager, {
      businessId,
      referenceType: AccountTransactionReferenceType.SALE_RETURN,
      referenceId: saleReturn.id,
      partyId: customer.id,
      transactionDate: saleReturn.returnDate,
      description,
      lines: journalLines,
    });

    saleReturn.status = SaleReturnStatus.APPROVED;
    await manager.getRepository(SaleReturn).save(saleReturn);

    return manager.getRepository(SaleReturn).findOneOrFail({
      where: { id: saleReturn.id },
      relations: this.returnRelations(),
    });
  }

  private async findCustomerForReturn(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    customerId: string,
  ): Promise<Party> {
    const customer = await tenantDb.getRepository(Party).findOne({
      where: { id: customerId, businessId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (
      customer.type !== PartyType.CUSTOMER &&
      customer.type !== PartyType.BOTH
    ) {
      throw new BadRequestException('Selected party is not a customer');
    }
    return customer;
  }

  private async resolveCustomerModeLines(
    manager: EntityManager,
    businessId: string,
    dto: CreateSaleReturnDto,
  ): Promise<ResolvedReturnLine[]> {
    const resolved: ResolvedReturnLine[] = [];

    for (const line of dto.items) {
      if (!line.productId || !line.uomId || !line.warehouseId) {
        throw new BadRequestException(
          'Customer-mode return items require productId, uomId, and warehouseId',
        );
      }
      if (line.unitPrice == null || Number(line.unitPrice) <= 0) {
        throw new BadRequestException(
          'Customer-mode return items require a unitPrice greater than zero',
        );
      }

      const warehouse = await manager.getRepository(Warehouse).findOne({
        where: { id: line.warehouseId, businessId },
      });
      if (!warehouse) {
        throw new NotFoundException(`Warehouse ${line.warehouseId} not found`);
      }

      const product = await manager.getRepository(Product).findOne({
        where: { id: line.productId, businessId, isDelete: false },
      });
      if (!product) {
        throw new NotFoundException(`Product ${line.productId} not found`);
      }

      const uom = await manager.getRepository(Uom).findOne({
        where: { id: line.uomId, businessId },
      });
      if (!uom) {
        throw new NotFoundException(`UOM ${line.uomId} not found`);
      }

      if (line.productFlavourId) {
        const flavour = await manager.getRepository(ProductFlavour).findOne({
          where: {
            id: line.productFlavourId,
            productId: line.productId,
          },
        });
        if (!flavour) {
          throw new BadRequestException(
            `Flavour ${line.productFlavourId} does not belong to product ${line.productId}`,
          );
        }
      }

      const pricing = await manager.getRepository(ProductPricing).findOne({
        where: { productId: line.productId, uomId: line.uomId },
      });
      if (!pricing) {
        throw new BadRequestException(
          `Product ${line.productId} has no pricing for UOM ${line.uomId}`,
        );
      }

      const saleUnitPrice = this.roundAmount(Number(line.unitPrice));
      const purchaseUnitPrice = this.roundAmount(
        Number(pricing.purchaseUnitPrice ?? 0),
      );

      resolved.push({
        itemType: SaleItemType.PRODUCT,
        serviceId: null,
        warehouseId: line.warehouseId,
        productId: line.productId,
        uomId: line.uomId,
        productFlavourId: line.productFlavourId ?? null,
        quantity: line.quantity,
        lineAmount: this.roundAmount(saleUnitPrice * line.quantity),
        purchaseUnitPrice,
        saleUnitPrice,
      });
    }

    return resolved;
  }

  private async persistNewSaleReturn(
    manager: EntityManager,
    scopedBusinessId: string,
    dto: CreateSaleReturnDto,
  ): Promise<{
    saleReturn: SaleReturn;
    resolvedLines: ResolvedReturnLine[];
    customer: Party;
  }> {
    const returnRepo = manager.getRepository(SaleReturn);
    const returnNumber =
      dto.returnNumber?.trim() || (await this.generateReturnNumber(manager));

    if (dto.returnNumber?.trim()) {
      const taken = await returnRepo.findOne({
        where: { returnNumber },
      });
      if (taken) {
        throw new ConflictException(
          'Sale return with this number already exists',
        );
      }
    }

    const returnMode = dto.returnMode ?? SaleReturnMode.INVOICE;
    let resolvedLines: ResolvedReturnLine[];
    let customer: Party;
    let saleInvoiceId: string | null = null;

    if (returnMode === SaleReturnMode.INVOICE) {
      if (!dto.saleInvoiceId) {
        throw new BadRequestException(
          'saleInvoiceId is required for invoice-mode sale returns',
        );
      }
      const invoice = await this.findSaleInvoiceForReturn(
        manager,
        scopedBusinessId,
        dto.saleInvoiceId,
      );
      customer = invoice.customer as Party;
      if (!customer?.id) {
        throw new BadRequestException(
          'Sale invoice customer is required to create a return',
        );
      }
      const alreadyReturned = await this.getReturnedQuantityByInvoiceItem(
        manager,
        invoice.id,
      );
      resolvedLines = this.resolveCreateLines(invoice, dto, alreadyReturned);
      saleInvoiceId = invoice.id;
    } else {
      if (!dto.customerId) {
        throw new BadRequestException(
          'customerId is required for customer-mode sale returns',
        );
      }
      customer = await this.findCustomerForReturn(
        manager,
        scopedBusinessId,
        dto.customerId,
      );
      resolvedLines = await this.resolveCustomerModeLines(
        manager,
        scopedBusinessId,
        dto,
      );
    }

    const saleReturn = await returnRepo.save(
      returnRepo.create({
        businessId: scopedBusinessId,
        returnMode,
        saleInvoiceId,
        customerId: customer.id,
        returnNumber,
        returnDate: new Date(dto.returnDate),
        returnReason: dto.returnReason.trim(),
        status: SaleReturnStatus.PENDING,
      }),
    );

    await manager.getRepository(SaleReturnItem).save(
      resolvedLines.map((line) =>
        manager.getRepository(SaleReturnItem).create({
          saleReturnId: saleReturn.id,
          itemType: line.itemType,
          serviceId: line.serviceId,
          warehouseId: line.warehouseId,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          quantity: line.quantity,
          saleUnitPrice: line.saleUnitPrice,
          purchaseUnitPrice: line.purchaseUnitPrice,
        }),
      ),
    );

    return { saleReturn, resolvedLines, customer };
  }

  private async reverseReturnSideEffects(
    manager: EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
    lines: ResolvedReturnLine[],
    customer: Party,
  ): Promise<void> {
    if (!customer?.receivableAccountId) {
      throw new BadRequestException(
        'Customer receivable account is required to reverse a sale return',
      );
    }

    const totalAmount = this.roundAmount(
      lines.reduce((sum, line) => sum + line.lineAmount, 0),
    );

    if (totalAmount > 0) {
      await this.consumeStockForReturnReversal(manager, businessId, lines);

      const [salesRevenue, cogs, inventory] = await Promise.all([
        resolveSalesRevenueAccount(manager, businessId),
        resolveCogsAccount(manager, businessId),
        resolveInventoryControlAccount(manager, businessId),
      ]);
      const description = `Sale return ${saleReturn.returnNumber} reversal`;
      const cogsAmount = this.roundAmount(
        this.productLinesOnly(lines).reduce(
          (sum, line) =>
            sum + Number(line.quantity) * Number(line.purchaseUnitPrice ?? 0),
          0,
        ),
      );

      // Reverse the return journal (re-apply sale sides).
      const journalLines = [
        {
          chartOfAccountId: customer.receivableAccountId,
          debitAmount: totalAmount,
          description,
        },
        {
          chartOfAccountId: salesRevenue.id,
          creditAmount: totalAmount,
          description,
        },
      ];
      if (cogsAmount > 0) {
        journalLines.push(
          {
            chartOfAccountId: cogs.id,
            debitAmount: cogsAmount,
            description,
          },
          {
            chartOfAccountId: inventory.id,
            creditAmount: cogsAmount,
            description,
          },
        );
      }

      await this.transactionService.postJournal(manager, {
        businessId,
        referenceType: AccountTransactionReferenceType.SALE_RETURN,
        referenceId: saleReturn.id,
        partyId: customer.id,
        transactionDate: saleReturn.returnDate,
        description,
        lines: journalLines,
      });
    }
  }

  async reverseApprovedEffects(
    manager: EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
  ): Promise<void> {
    if (saleReturn.status === SaleReturnStatus.APPROVED) {
      const resolvedLines = await this.resolvedLinesFromReturn(
        manager,
        businessId,
        saleReturn,
      );
      const stockLines = resolvedLines.filter((line) => line.quantity > 0);
      if (stockLines.length) {
        await this.consumeStockForReturnReversal(
          manager,
          businessId,
          stockLines,
        );
      }
      await this.transactionService.deleteLedgerEntriesByReference(manager, {
        businessId,
        referenceType: AccountTransactionReferenceType.SALE_RETURN,
        referenceId: saleReturn.id,
      });
    }

    saleReturn.status = SaleReturnStatus.REJECTED;
    await manager.getRepository(SaleReturn).save(saleReturn);
  }

  async removeForOrderCascade(
    manager: EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
  ): Promise<void> {
    await this.reverseApprovedEffects(manager, businessId, saleReturn);

    await manager
      .getRepository(SaleReturnItem)
      .delete({ saleReturnId: saleReturn.id });
    await manager.getRepository(SaleReturn).delete(saleReturn.id);
  }

  private async resolvedLinesFromReturn(
    manager: DataSource | EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
  ): Promise<ResolvedReturnLine[]> {
    const items = saleReturn.saleReturnItems ?? [];
    const hasStoredPrices = items.some(
      (item) =>
        Number(item.saleUnitPrice ?? 0) > 0 ||
        Number(item.purchaseUnitPrice ?? 0) > 0,
    );

    if (
      saleReturn.returnMode === SaleReturnMode.CUSTOMER ||
      !saleReturn.saleInvoiceId ||
      hasStoredPrices
    ) {
      return items.map((item) => {
        const saleUnitPrice = Number(item.saleUnitPrice ?? 0);
        const purchaseUnitPrice = Number(item.purchaseUnitPrice ?? 0);
        const quantity = Number(item.quantity);
        return {
          itemType: item.itemType ?? SaleItemType.PRODUCT,
          serviceId: item.serviceId ?? null,
          warehouseId: item.warehouseId,
          productId: item.productId,
          uomId: item.uomId,
          productFlavourId: item.productFlavourId ?? null,
          quantity,
          lineAmount: this.roundAmount(saleUnitPrice * quantity),
          purchaseUnitPrice,
          saleUnitPrice,
        };
      });
    }

    const invoice = await this.findSaleInvoiceForReturn(
      manager,
      businessId,
      saleReturn.saleInvoiceId,
    );

    return items.map((item) => {
      const itemKey = this.itemKey(item);
      const invoiceItem = invoice.items?.find(
        (row) => this.itemKey(row) === itemKey,
      );
      if (!invoiceItem) {
        throw new BadRequestException(
          'Sale return item no longer matches the source invoice',
        );
      }

      const orderItem = this.findSaleOrderItem(
        invoice.saleOrder?.items,
        invoiceItem,
      );

      const saleUnitPrice = Number(
        item.saleUnitPrice ?? orderItem?.saleUnitPrice ?? 0,
      );
      const purchaseUnitPrice = Number(
        item.purchaseUnitPrice ?? orderItem?.purchaseUnitPrice ?? 0,
      );

      return {
        itemType: item.itemType ?? SaleItemType.PRODUCT,
        serviceId: item.serviceId ?? null,
        warehouseId: item.warehouseId,
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId ?? null,
        quantity: Number(item.quantity),
        lineAmount:
          saleUnitPrice > 0
            ? this.roundAmount(saleUnitPrice * Number(item.quantity))
            : this.lineAmountForQuantity(invoiceItem, Number(item.quantity)),
        purchaseUnitPrice,
        saleUnitPrice,
      };
    });
  }

  private async resolveCustomerForSaleReturn(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
  ): Promise<Party> {
    if (saleReturn.customer) {
      return saleReturn.customer;
    }
    if (saleReturn.customerId) {
      return this.findCustomerForReturn(
        tenantDb,
        businessId,
        saleReturn.customerId,
      );
    }
    if (saleReturn.saleInvoiceId) {
      const invoice = await this.findSaleInvoiceForReturn(
        tenantDb,
        businessId,
        saleReturn.saleInvoiceId,
      );
      return invoice.customer as Party;
    }
    throw new BadRequestException(
      'Sale return customer is required for this action',
    );
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const { saleReturn } = await this.persistNewSaleReturn(
        manager,
        scopedBusinessId,
        dto,
      );

      return manager.getRepository(SaleReturn).findOneOrFail({
        where: { id: saleReturn.id },
        relations: this.returnRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_CREATED',
      description: `Sale return ${created.returnNumber} created`,
      metadata: {
        saleReturnId: created.id,
        returnMode: created.returnMode,
        saleInvoiceId: created.saleInvoiceId,
        customerId: created.customerId,
        status: created.status,
      },
    });

    return { data: this.mapSaleReturn(created) };
  }

  async createAndApprove(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const { saleReturn, resolvedLines, customer } =
        await this.persistNewSaleReturn(manager, scopedBusinessId, dto);

      return this.executeSaleReturnApproval(
        manager,
        scopedBusinessId,
        saleReturn,
        resolvedLines,
        customer,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_CREATED_AND_APPROVED',
      description: `Sale return ${created.returnNumber} created and approved`,
      metadata: {
        saleReturnId: created.id,
        returnMode: created.returnMode,
        saleInvoiceId: created.saleInvoiceId,
        customerId: created.customerId,
        status: created.status,
      },
    });

    return { data: this.mapSaleReturn(created) };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saleReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    this.assertPendingStatus(
      saleReturn,
      'Only pending sale returns can be approved',
    );

    const customer = await this.resolveCustomerForSaleReturn(
      tenantDb,
      scopedBusinessId,
      saleReturn,
    );
    const resolvedLines = await this.resolvedLinesFromReturn(
      tenantDb,
      scopedBusinessId,
      saleReturn,
    );

    const approved = await tenantDb.transaction(async (manager) =>
      this.executeSaleReturnApproval(
        manager,
        scopedBusinessId,
        saleReturn,
        resolvedLines,
        customer,
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_APPROVED',
      description: `Sale return ${approved.returnNumber} approved — stock received, customer receivable reduced`,
      metadata: {
        saleReturnId: approved.id,
        saleInvoiceId: approved.saleInvoiceId,
        customerId: approved.customerId,
      },
    });

    return { data: this.mapSaleReturn(approved) };
  }

  async bulkApprove(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: BulkApproveSaleReturnsDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const ids = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean))];

    if (!ids.length) {
      throw new BadRequestException('At least one sale return id is required');
    }

    const results: Array<{
      id: string;
      returnNumber?: string;
      status: 'success' | 'error';
      message?: string;
      saleReturn?: ReturnType<SaleReturnService['mapSaleReturn']>;
    }> = [];

    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const approved = await this.approve(
          tenantDb,
          scopedBusinessId,
          id,
          actorUserId,
        );
        succeeded += 1;
        results.push({
          id,
          returnNumber: approved.data.returnNumber,
          status: 'success',
          saleReturn: approved.data,
        });
      } catch (error) {
        failed += 1;
        let returnNumber: string | undefined;
        try {
          const existing = await tenantDb
            .getRepository(SaleReturn)
            .findOne({ where: { id }, select: ['id', 'returnNumber'] });
          returnNumber = existing?.returnNumber;
        } catch {
          // ignore lookup failure for error row label
        }
        results.push({
          id,
          returnNumber,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_BULK_APPROVED',
      description: `Bulk approve sale returns finished. Succeeded: ${succeeded}, Failed: ${failed}`,
      metadata: {
        total: ids.length,
        succeeded,
        failed,
        ids,
      },
    });

    return {
      total: ids.length,
      succeeded,
      failed,
      results,
    };
  }

  async reject(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saleReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );
    this.assertPendingStatus(
      saleReturn,
      'Only pending sale returns can be rejected',
    );

    saleReturn.status = SaleReturnStatus.REJECTED;
    const rejected = await tenantDb.getRepository(SaleReturn).save(saleReturn);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_REJECTED',
      description: `Sale return ${rejected.returnNumber} rejected`,
      metadata: { saleReturnId: rejected.id },
    });

    return {
      message: 'Sale return rejected',
      data: { id: rejected.id, returnNumber: rejected.returnNumber },
    };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      saleInvoiceId?: string;
      customerId?: string;
      status?: SaleReturnStatus;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .leftJoinAndSelect('saleReturn.customer', 'returnCustomer')
      .leftJoinAndSelect('saleReturn.saleInvoice', 'saleInvoice')
      .leftJoinAndSelect('saleInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('saleInvoice.customer', 'invoiceCustomer')
      .leftJoinAndSelect('saleReturn.saleReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.service', 'service')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('saleReturn.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.saleInvoiceId) {
      qb.andWhere('saleReturn.saleInvoiceId = :saleInvoiceId', {
        saleInvoiceId: options.saleInvoiceId,
      });
    }
    if (options.customerId) {
      qb.andWhere('saleReturn.customerId = :customerId', {
        customerId: options.customerId,
      });
    }
    if (options.status) {
      qb.andWhere('saleReturn.status = :status', {
        status: options.status,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('saleReturn.returnNumber ILIKE :search', { search })
            .orWhere('saleReturn.returnReason ILIKE :search', { search })
            .orWhere('saleInvoice.invoiceNumber ILIKE :search', { search })
            .orWhere('returnCustomer.name ILIKE :search', { search })
            .orWhere('returnCustomer.code ILIKE :search', { search })
            .orWhere('invoiceCustomer.name ILIKE :search', { search })
            .orWhere('invoiceCustomer.code ILIKE :search', { search });
        }),
      );
    }

    const [[returns, total], analytics] = await Promise.all([
      qb
        .orderBy('saleReturn.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount(),
      this.listAnalyticsService.getDocumentAnalytics(
        tenantDb,
        scopedBusinessId,
        ListAnalyticsModule.SALE_RETURN,
      ),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_LISTED',
      description: 'Sale returns listed',
      metadata: { total, page, limit },
    });

    return {
      data: returns.map((row) => this.mapSaleReturn(row)),
      meta: { total, page, limit },
      analytics,
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saleReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_VIEWED',
      description: `Sale return ${saleReturn.returnNumber} viewed`,
      metadata: { saleReturnId: saleReturn.id },
    });

    return { data: this.mapSaleReturn(saleReturn) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    dto: UpdateSaleReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saleReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );
    this.assertPendingStatus(
      saleReturn,
      'Only pending sale returns can be modified',
    );

    const updated = await tenantDb.transaction(async (manager) => {
      const returnRepo = manager.getRepository(SaleReturn);

      if (dto.returnNumber !== undefined) {
        const nextNumber = dto.returnNumber.trim();
        if (!nextNumber) {
          throw new BadRequestException('Return number cannot be empty');
        }
        if (nextNumber !== saleReturn.returnNumber) {
          const taken = await returnRepo.findOne({
            where: { returnNumber: nextNumber },
          });
          if (taken) {
            throw new ConflictException(
              'Sale return with this number already exists',
            );
          }
          saleReturn.returnNumber = nextNumber;
        }
      }

      if (dto.returnDate !== undefined) {
        saleReturn.returnDate = new Date(dto.returnDate);
      }
      if (dto.returnReason !== undefined) {
        saleReturn.returnReason = dto.returnReason.trim();
      }

      await returnRepo.save(saleReturn);

      return returnRepo.findOneOrFail({
        where: { id: saleReturn.id },
        relations: this.returnRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_UPDATED',
      description: `Sale return ${updated.returnNumber} updated`,
      metadata: { saleReturnId: updated.id },
    });

    return { data: this.mapSaleReturn(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const saleReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    if (saleReturn.status === SaleReturnStatus.APPROVED) {
      const customer = await this.resolveCustomerForSaleReturn(
        tenantDb,
        scopedBusinessId,
        saleReturn,
      );
      const resolvedLines = await this.resolvedLinesFromReturn(
        tenantDb,
        scopedBusinessId,
        saleReturn,
      );

      await tenantDb.transaction(async (manager) => {
        await this.reverseReturnSideEffects(
          manager,
          scopedBusinessId,
          saleReturn,
          resolvedLines,
          customer,
        );

        await manager
          .getRepository(SaleReturnItem)
          .delete({ saleReturnId: saleReturn.id });
        await manager.getRepository(SaleReturn).delete(saleReturn.id);
      });
    } else {
      await tenantDb.transaction(async (manager) => {
        await manager
          .getRepository(SaleReturnItem)
          .delete({ saleReturnId: saleReturn.id });
        await manager.getRepository(SaleReturn).delete(saleReturn.id);
      });
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_DELETED',
      description: `Sale return ${saleReturn.returnNumber} deleted`,
      metadata: { saleReturnId: saleReturn.id },
    });

    return {
      message: 'Sale return deleted',
      data: {
        id: saleReturn.id,
        returnNumber: saleReturn.returnNumber,
      },
    };
  }

  private toJsonNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private formatReturnDateForJson(returnDate: Date | string): string {
    if (typeof returnDate === 'string') {
      return returnDate.slice(0, 10);
    }
    return returnDate.toISOString().slice(0, 10);
  }

  private mapSaleReturnToJsonItem(saleReturn: SaleReturn): SaleReturnJsonItemDto {
    return {
      returnNumber: saleReturn.returnNumber,
      returnDate: this.formatReturnDateForJson(saleReturn.returnDate),
      returnReason: saleReturn.returnReason,
      saleInvoiceNumber: saleReturn.saleInvoice?.invoiceNumber ?? '',
      // JSON import/export is product-only; service lines are not exported.
      items: (saleReturn.saleReturnItems ?? [])
        .filter((item) => isProductSaleItem(item))
        .map((item) => ({
        warehouseCode: item.warehouse?.code ?? '',
        skuCode: item.product?.skuCode ?? '',
        uomName: item.uom?.name ?? '',
        productFlavourName: item.productFlavour?.flavour?.name ?? null,
        quantity: this.toJsonNumber(item.quantity),
      })),
    };
  }

  async exportSaleReturnsJson(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const returns = await tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .leftJoinAndSelect('saleReturn.saleInvoice', 'saleInvoice')
      .leftJoinAndSelect('saleReturn.saleReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .where('saleReturn.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('saleReturn.status = :status', {
        status: SaleReturnStatus.APPROVED,
      })
      .orderBy('saleReturn.returnNumber', 'ASC')
      .addOrderBy('items.createdAt', 'ASC')
      .getMany();

    const items = returns
      .map((row) => this.mapSaleReturnToJsonItem(row))
      .filter((row) => row.items.length > 0);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_JSON_EXPORTED',
      description: 'Approved sale returns exported as JSON',
      metadata: {
        businessId: scopedBusinessId,
        count: items.length,
        status: SaleReturnStatus.APPROVED,
      },
    });

    return {
      format: SALESVINCE_EXPORT_FORMAT,
      version: 1,
      entity: JsonExportEntity.SALE_RETURNS,
      exportedAt: new Date().toISOString(),
      items,
    };
  }

  private sanitizeJsonEmptyStrings(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJsonEmptyStrings(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>,
      )) {
        out[key] =
          nested === '' ? null : this.sanitizeJsonEmptyStrings(nested);
      }
      return out;
    }
    return value;
  }

  private formatJsonValidationErrors(
    errors: ReturnType<typeof validateSync>,
  ): string {
    const walk = (list: typeof errors, prefix = ''): string[] => {
      const messages: string[] = [];
      for (const error of list) {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        messages.push(
          ...Object.values(error.constraints ?? {}).map(
            (msg) => `${path}: ${msg}`,
          ),
        );
        if (error.children?.length) {
          messages.push(...walk(error.children, path));
        }
      }
      return messages;
    };
    return walk(errors).join('; ');
  }

  private parseSaleReturnJsonImportFile(
    file: Express.Multer.File,
  ): SaleReturnJsonImportDto {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'JSON file is required. Use multipart form-data field "file".',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON file');
    }

    const dto = plainToInstance(
      SaleReturnJsonImportDto,
      this.sanitizeJsonEmptyStrings(parsed),
      { enableImplicitConversion: true },
    );
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length) {
      throw new BadRequestException(
        this.formatJsonValidationErrors(errors) ||
          'Invalid sale return JSON import payload',
      );
    }

    if (dto.entity && dto.entity !== JsonExportEntity.SALE_RETURNS) {
      throw new BadRequestException(
        'entity must be "saleReturns" for sale return JSON import',
      );
    }

    return dto;
  }

  private resolveSaleReturnJsonImportMode(
    fileMode: JsonImportMode | undefined,
    bodyMode?: string,
  ): JsonImportMode {
    const raw = bodyMode?.trim() || fileMode;
    if (!raw) {
      return JsonImportMode.CREATE_ONLY;
    }
    if (raw === JsonImportMode.UPSERT || raw === JsonImportMode.CREATE_ONLY) {
      return JsonImportMode.CREATE_ONLY;
    }
    throw new BadRequestException('mode must be upsert or createOnly');
  }

  private async findSaleInvoiceByNumberForJson(
    tenantDb: DataSource,
    businessId: string,
    invoiceNumber: string,
  ): Promise<SaleInvoice> {
    const invoice = await tenantDb.getRepository(SaleInvoice).findOne({
      where: {
        invoiceNumber,
        businessId,
        deletedAt: IsNull(),
      },
      relations: {
        items: {
          product: true,
          uom: true,
          warehouse: true,
          productFlavour: { flavour: true },
        },
        customer: true,
        deliveryNote: true,
        saleOrder: { items: true },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Sale invoice ${invoiceNumber} not found`);
    }
    if (!invoice.items?.length) {
      throw new BadRequestException(
        `Sale invoice ${invoiceNumber} must have items to create a return`,
      );
    }

    return invoice;
  }

  private matchSaleInvoiceItemId(
    invoice: SaleInvoice,
    line: {
      warehouseCode: string;
      skuCode: string;
      uomName: string;
      productFlavourName?: string | null;
    },
    lineIndex: number,
  ): string {
    const warehouseCode = line.warehouseCode.trim();
    const skuCode = line.skuCode.trim();
    const uomName = line.uomName.trim();
    const flavourName = line.productFlavourName?.trim() || null;

    const matches = (invoice.items ?? []).filter((item) => {
      const itemWh = item.warehouse?.code?.trim();
      const itemSku = item.product?.skuCode?.trim();
      const itemUom = item.uom?.name?.trim();
      const itemFlavour = item.productFlavour?.flavour?.name?.trim() || null;
      return (
        itemWh === warehouseCode &&
        itemSku === skuCode &&
        itemUom === uomName &&
        itemFlavour === flavourName
      );
    });

    if (!matches.length) {
      throw new NotFoundException(
        `Line ${lineIndex + 1}: no invoice item for warehouse ${warehouseCode} / SKU ${skuCode} / UOM ${uomName}` +
          (flavourName ? ` / flavour ${flavourName}` : ''),
      );
    }

    return matches[0].id;
  }

  private async buildCreateDtoFromJsonItem(
    tenantDb: DataSource,
    businessId: string,
    item: SaleReturnJsonItemDto,
  ): Promise<CreateSaleReturnDto> {
    const invoice = await this.findSaleInvoiceByNumberForJson(
      tenantDb,
      businessId,
      item.saleInvoiceNumber.trim(),
    );

    const lineItems: CreateSaleReturnItemDto[] = item.items.map(
      (line, lineIndex) => ({
        saleInvoiceItemId: this.matchSaleInvoiceItemId(
          invoice,
          line,
          lineIndex,
        ),
        quantity: line.quantity,
      }),
    );

    return {
      returnMode: SaleReturnMode.INVOICE,
      saleInvoiceId: invoice.id,
      returnNumber: item.returnNumber.trim(),
      returnDate: item.returnDate,
      returnReason: item.returnReason,
      items: lineItems,
    };
  }

  private async notifySaleReturnJsonImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Sale return JSON import completed'
        : 'Sale return JSON import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        businessId: user.businessId,
        message,
        type: 'sale_return_json_import',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
      },
    );
  }

  private async processSaleReturnJsonImportJob(
    tenantDb: DataSource,
    jobId: string,
    items: SaleReturnJsonItemDto[],
    mode: JsonImportMode,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const scopedBusinessId = user.businessId;
    let created = 0;
    let skipped = 0;

    for (const [index, item] of items.entries()) {
      const key = item.returnNumber?.trim() || `row-${index + 1}`;
      try {
        const returnNumber = item.returnNumber.trim();
        const existing = await tenantDb.getRepository(SaleReturn).findOne({
          where: { returnNumber },
          select: ['id', 'returnNumber'],
        });

        if (existing) {
          skipped += 1;
          this.tenantJobService.appendLog(jobId, {
            row: index + 1,
            name: key,
            status: 'error',
            error: `Sale return ${returnNumber} already exists`,
            metadata: {
              outcome: 'skipped',
              saleReturnId: existing.id,
              mode,
            },
          });
          continue;
        }

        const createDto = await this.buildCreateDtoFromJsonItem(
          tenantDb,
          scopedBusinessId,
          item,
        );
        const createdReturn = await this.create(
          tenantDb,
          scopedBusinessId,
          createDto,
          user.userId,
        );
        created += 1;
        this.tenantJobService.appendLog(jobId, {
          row: index + 1,
          name: createdReturn.data.returnNumber,
          status: 'success',
          metadata: {
            outcome: 'created',
            saleReturnId: createdReturn.data.id,
            returnNumber: createdReturn.data.returnNumber,
            status: createdReturn.data.status,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: index + 1,
          name: key,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Sale return JSON import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        created,
        skipped,
        mode,
      },
    });

    await this.notifySaleReturnJsonImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importSaleReturnsJson(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
    bodyMode?: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(user.businessId);
    const dto = this.parseSaleReturnJsonImportFile(file);
    const mode = this.resolveSaleReturnJsonImportMode(
      dto.options?.mode,
      bodyMode,
    );

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: scopedBusinessId,
      jobType: 'SALE_RETURN_JSON_IMPORT',
      fileName: file.originalname || 'sale-returns.json',
      createdBy: user.userId,
      totalRows: dto.items.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_STARTED',
      description: `Sale return JSON import started for ${job.fileName}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: job.fileName,
        totalRows: job.totalRows,
        mode,
      },
    });

    void this.processSaleReturnJsonImportJob(
      tenantDb,
      job.id,
      dto.items,
      mode,
      user,
      tenantCode,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Unknown processing failure',
      });
      const failedJob = this.tenantJobService.getJobById(
        job.id,
        tenantCode,
        user.userId,
      );

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: scopedBusinessId,
        action: 'TENANT_JOB_FAILED',
        description: `Sale return JSON import failed for ${job.fileName}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: job.fileName,
          error: error instanceof Error ? error.message : String(error),
          mode,
        },
      });
      await this.notifySaleReturnJsonImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Sale return JSON import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
      mode,
    };
  }
}
