import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  SaleReturn,
  SaleReturnItem,
  SaleReturnStatus,
} from 'src/tenant-db/entities/sale-return.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleOrderItem } from 'src/tenant-db/entities/sale-order.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { CreateSaleReturnDto } from '../../dto/sale-return/create-sale-return.dto';
import { UpdateSaleReturnDto } from '../../dto/sale-return/update-sale-return.dto';
import { ActivityLogService } from '../activity-log.service';
import { StockService } from '../stock.service';
import { TransactionService } from '../transaction.service';

const RETURN_NUMBER_PREFIX = 'SRT';

type ResolvedReturnLine = {
  warehouseId: string;
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  quantity: number;
  lineAmount: number;
  purchaseUnitPrice: number;
  saleUnitMarginAmount: number;
  saleUnitMarginPercentage: number;
};

@Injectable()
export class SaleReturnService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
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
      saleInvoice: {
        items: true,
        customer: true,
        deliveryNote: true,
        saleOrder: { items: true },
      },
      saleReturnItems: {
        product: true,
        productFlavour: { flavour: true },
        uom: true,
        warehouse: true,
      },
    } as const;
  }

  private itemKey(item: {
    productId: string;
    uomId: string;
    productFlavourId?: string | null;
  }): string {
    return `${item.productId}:${item.uomId}:${item.productFlavourId ?? ''}`;
  }

  private findSaleOrderItem(
    orderItems: SaleOrderItem[] | undefined,
    invoiceItem: SaleInvoiceItem,
  ): SaleOrderItem | undefined {
    return orderItems?.find(
      (row) =>
        row.productId === invoiceItem.productId &&
        row.uomId === invoiceItem.uomId &&
        (row.productFlavourId ?? null) === (invoiceItem.productFlavourId ?? null),
    );
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
          `Return quantity exceeds remaining invoice quantity for product ${invoiceItem.productId}`,
        );
      }

      const orderItem = this.findSaleOrderItem(
        invoice.saleOrder?.items,
        invoiceItem,
      );

      resolved.push({
        warehouseId: invoiceItem.warehouseId,
        productId: invoiceItem.productId,
        uomId: invoiceItem.uomId,
        productFlavourId: invoiceItem.productFlavourId ?? null,
        quantity: line.quantity,
        lineAmount: this.lineAmountForQuantity(invoiceItem, line.quantity),
        purchaseUnitPrice: Number(orderItem?.purchaseUnitPrice ?? 0),
        saleUnitMarginAmount: Number(orderItem?.saleMarginAmount ?? 0),
        saleUnitMarginPercentage: Number(orderItem?.saleMarginPercentage ?? 0),
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
      .leftJoinAndSelect('saleReturn.saleInvoice', 'saleInvoice')
      .leftJoinAndSelect('saleInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('saleInvoice.deliveryNote', 'deliveryNote')
      .leftJoinAndSelect('saleInvoice.customer', 'customer')
      .leftJoinAndSelect('saleInvoice.saleOrder', 'saleOrder')
      .leftJoinAndSelect('saleOrder.items', 'saleOrderItems')
      .leftJoinAndSelect('saleReturn.saleReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
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
    const items = (saleReturn.saleReturnItems ?? []).map((item) => ({
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
      uomId: item.uomId,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : null,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const totalReturnAmount = items.reduce((sum, item) => {
      const invoiceItem = invoice?.items?.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
      );
      if (!invoiceItem) {
        return sum;
      }
      return sum + this.lineAmountForQuantity(invoiceItem, Number(item.quantity));
    }, 0);

    return {
      id: saleReturn.id,
      businessId: saleReturn.businessId,
      saleInvoiceId: saleReturn.saleInvoiceId,
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
    for (const line of lines) {
      const rows = grouped.get(line.warehouseId) ?? [];
      rows.push(line);
      grouped.set(line.warehouseId, rows);
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
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitMarginAmount: line.saleUnitMarginAmount,
          saleUnitMarginPercentage: line.saleUnitMarginPercentage,
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
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
        })),
      });
    }
  }

  private async executeSaleReturnApproval(
    manager: EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
    invoice: SaleInvoice,
    lines: ResolvedReturnLine[],
  ): Promise<SaleReturn> {
    this.assertPendingStatus(
      saleReturn,
      'Only pending sale returns can be approved',
    );

    const customer = invoice.customer as Party;

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
      invoice.customerId,
      saleReturn,
      lines,
    );

    await this.transactionService.postDirectLedgerEntry(manager, {
      businessId,
      chartOfAccountId: customer.receivableAccountId,
      referenceType: AccountTransactionReferenceType.SALE_RETURN,
      referenceId: saleReturn.id,
      partyId: customer.id,
      transactionDate: saleReturn.returnDate,
      description: `Sale return ${saleReturn.returnNumber} - customer receivable reduced`,
      creditAmount: totalAmount,
    });

    saleReturn.status = SaleReturnStatus.APPROVED;
    await manager.getRepository(SaleReturn).save(saleReturn);

    return manager.getRepository(SaleReturn).findOneOrFail({
      where: { id: saleReturn.id },
      relations: this.returnRelations(),
    });
  }

  private async persistNewSaleReturn(
    manager: EntityManager,
    scopedBusinessId: string,
    invoice: SaleInvoice,
    dto: CreateSaleReturnDto,
  ): Promise<{
    saleReturn: SaleReturn;
    resolvedLines: ResolvedReturnLine[];
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

    const alreadyReturned = await this.getReturnedQuantityByInvoiceItem(
      manager,
      invoice.id,
    );
    const resolvedLines = this.resolveCreateLines(
      invoice,
      dto,
      alreadyReturned,
    );

    const saleReturn = await returnRepo.save(
      returnRepo.create({
        businessId: scopedBusinessId,
        saleInvoiceId: invoice.id,
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
          warehouseId: line.warehouseId,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          quantity: line.quantity,
        }),
      ),
    );

    return { saleReturn, resolvedLines };
  }

  private async reverseReturnSideEffects(
    manager: EntityManager,
    businessId: string,
    saleReturn: SaleReturn,
    invoice: SaleInvoice,
    lines: ResolvedReturnLine[],
  ): Promise<void> {
    const customer = invoice.customer as Party;

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

      await this.transactionService.postDirectLedgerEntry(manager, {
        businessId,
        chartOfAccountId: customer.receivableAccountId,
        referenceType: AccountTransactionReferenceType.SALE_RETURN,
        referenceId: saleReturn.id,
        partyId: customer.id,
        transactionDate: saleReturn.returnDate,
        description: `Sale return ${saleReturn.returnNumber} reversal`,
        debitAmount: totalAmount,
      });
    }
  }

  private resolvedLinesFromReturn(
    saleReturn: SaleReturn,
    invoice: SaleInvoice,
  ): ResolvedReturnLine[] {
    return (saleReturn.saleReturnItems ?? []).map((item) => {
      const invoiceItem = invoice.items?.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
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

      return {
        warehouseId: item.warehouseId,
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId ?? null,
        quantity: Number(item.quantity),
        lineAmount: this.lineAmountForQuantity(invoiceItem, Number(item.quantity)),
        purchaseUnitPrice: Number(orderItem?.purchaseUnitPrice ?? 0),
        saleUnitMarginAmount: Number(orderItem?.saleMarginAmount ?? 0),
        saleUnitMarginPercentage: Number(orderItem?.saleMarginPercentage ?? 0),
      };
    });
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const invoice = await this.findSaleInvoiceForReturn(
      tenantDb,
      scopedBusinessId,
      dto.saleInvoiceId,
    );

    const created = await tenantDb.transaction(async (manager) => {
      const { saleReturn } = await this.persistNewSaleReturn(
        manager,
        scopedBusinessId,
        invoice,
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
        saleInvoiceId: invoice.id,
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
    const invoice = await this.findSaleInvoiceForReturn(
      tenantDb,
      scopedBusinessId,
      dto.saleInvoiceId,
    );

    const created = await tenantDb.transaction(async (manager) => {
      const { saleReturn, resolvedLines } = await this.persistNewSaleReturn(
        manager,
        scopedBusinessId,
        invoice,
        dto,
      );

      return this.executeSaleReturnApproval(
        manager,
        scopedBusinessId,
        saleReturn,
        invoice,
        resolvedLines,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_CREATED_AND_APPROVED',
      description: `Sale return ${created.returnNumber} created and approved`,
      metadata: {
        saleReturnId: created.id,
        saleInvoiceId: invoice.id,
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

    const invoice = await this.findSaleInvoiceForReturn(
      tenantDb,
      scopedBusinessId,
      saleReturn.saleInvoiceId,
    );
    const resolvedLines = this.resolvedLinesFromReturn(saleReturn, invoice);

    const approved = await tenantDb.transaction(async (manager) =>
      this.executeSaleReturnApproval(
        manager,
        scopedBusinessId,
        saleReturn,
        invoice,
        resolvedLines,
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_RETURN_APPROVED',
      description: `Sale return ${approved.returnNumber} approved — stock received, customer receivable reduced`,
      metadata: {
        saleReturnId: approved.id,
        saleInvoiceId: invoice.id,
      },
    });

    return { data: this.mapSaleReturn(approved) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      saleInvoiceId?: string;
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
      .leftJoinAndSelect('saleReturn.saleInvoice', 'saleInvoice')
      .leftJoinAndSelect('saleInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('saleInvoice.customer', 'customer')
      .leftJoinAndSelect('saleReturn.saleReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('saleReturn.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.saleInvoiceId) {
      qb.andWhere('saleReturn.saleInvoiceId = :saleInvoiceId', {
        saleInvoiceId: options.saleInvoiceId,
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
            .orWhere('customer.name ILIKE :search', { search })
            .orWhere('customer.code ILIKE :search', { search });
        }),
      );
    }

    const [returns, total] = await qb
      .orderBy('saleReturn.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

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
      const invoice = await this.findSaleInvoiceForReturn(
        tenantDb,
        scopedBusinessId,
        saleReturn.saleInvoiceId,
      );
      const resolvedLines = this.resolvedLinesFromReturn(saleReturn, invoice);

      await tenantDb.transaction(async (manager) => {
        await this.reverseReturnSideEffects(
          manager,
          scopedBusinessId,
          saleReturn,
          invoice,
          resolvedLines,
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
}
