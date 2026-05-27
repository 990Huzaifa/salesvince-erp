import {
  BadRequestException,
  ConflictException,
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
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
} from 'src/tenant-db/entities/sale-order.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { CreateDeliveryNoteDto } from '../../dto/delivery-note/create-delivery-note.dto';
import { CreateDeliveryNoteItemDto } from '../../dto/delivery-note/create-delivery-note-item.dto';
import { ActivityLogService } from '../activity-log.service';
import { StockService } from '../stock.service';
import { TransactionService } from '../transaction.service';

const DELIVERY_NOTE_NUMBER_PREFIX = 'DN';

type ResolvedDeliveryNoteLine = {
  saleOrderItemId: string;
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  orderedQuantity: number;
  deliveredQuantity: number;
  saleUnitPrice: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
};

type DeliveryNoteTotals = {
  totalTaxAmount: number;
  totalDiscountAmount: number;
  totalAmount: number;
};

@Injectable()
export class DeliveryNoteService {
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

  private resolveCreateStatus(status?: DeliveryNoteStatus): DeliveryNoteStatus {
    const resolved = status ?? DeliveryNoteStatus.PENDING;
    if (
      resolved !== DeliveryNoteStatus.PENDING &&
      resolved !== DeliveryNoteStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Delivery note status on create must be PENDING or APPROVED',
      );
    }
    return resolved;
  }

  private deliveryNoteRelations() {
    return {
      saleOrder: true,
      warehouse: true,
      customer: true,
      items: {
        saleOrderItem: true,
        product: true,
        productFlavour: { flavour: true },
        uom: true,
      },
    } as const;
  }

  private async generateDeliveryNoteNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(DeliveryNote)
      .createQueryBuilder('deliveryNote')
      .where('deliveryNote.deliveryNoteNumber LIKE :prefix', {
        prefix: `${DELIVERY_NOTE_NUMBER_PREFIX}-%`,
      })
      .orderBy('deliveryNote.deliveryNoteNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.deliveryNoteNumber.replace(
        `${DELIVERY_NOTE_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${DELIVERY_NOTE_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertCustomerForApproval(
    repositorySource: DataSource | EntityManager,
    businessId: string,
    customerId: string,
  ): Promise<Party> {
    const customer = await repositorySource.getRepository(Party).findOne({
      where: { id: customerId, businessId, deletedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (
      customer.type !== PartyType.CUSTOMER &&
      customer.type !== PartyType.BOTH
    ) {
      throw new BadRequestException('Delivery note party must be a customer');
    }
    if (!customer.receivableAccountId) {
      throw new BadRequestException(
        'Customer receivable account is required before approving delivery note',
      );
    }

    return customer;
  }

  private resolveLineFromSaleOrderItem(
    orderItem: SaleOrderItem,
    deliveredQuantity: number,
    headerTaxPercentage: number,
  ): ResolvedDeliveryNoteLine {
    const saleUnitPrice = this.roundAmount(
      Number(orderItem.purchaseUnitPrice) + Number(orderItem.saleMarginAmount),
    );
    const lineSubtotal = saleUnitPrice * deliveredQuantity;
    const discountPercentage = this.roundAmount(
      Number(orderItem.discountPercentage),
    );
    const discountAmount = this.roundAmount(
      (lineSubtotal * discountPercentage) / 100,
    );
    const taxableBase = this.roundAmount(lineSubtotal - discountAmount);
    const taxAmount = this.roundAmount(
      (taxableBase * headerTaxPercentage) / 100,
    );
    const totalAmount = this.roundAmount(taxableBase + taxAmount);

    return {
      saleOrderItemId: orderItem.id,
      productId: orderItem.productId,
      uomId: orderItem.uomId,
      productFlavourId: orderItem.productFlavourId ?? null,
      orderedQuantity: orderItem.quantity,
      deliveredQuantity,
      saleUnitPrice,
      discountPercentage,
      discountAmount,
      taxPercentage: headerTaxPercentage,
      taxAmount,
      totalAmount,
    };
  }

  private computeDeliveryNoteTotals(
    lines: ResolvedDeliveryNoteLine[],
    options: {
      deliveryCost?: number;
      taxPercentage?: number;
      discountPercentage?: number;
    },
  ): DeliveryNoteTotals {
    const lineBase = this.roundAmount(
      lines.reduce(
        (sum, line) =>
          sum +
          line.saleUnitPrice * line.deliveredQuantity -
          Number(line.discountAmount),
        0,
      ),
    );
    const deliveryCost = this.roundAmount(options.deliveryCost ?? 0);
    const discountPercentage = this.roundAmount(options.discountPercentage ?? 0);
    const totalDiscountAmount = this.roundAmount(
      (lineBase * discountPercentage) / 100,
    );
    const taxableBase = this.roundAmount(lineBase - totalDiscountAmount);
    const taxPercentage = this.roundAmount(options.taxPercentage ?? 0);
    const totalTaxAmount = this.roundAmount(
      (taxableBase * taxPercentage) / 100,
    );
    const totalAmount = this.roundAmount(
      taxableBase + totalTaxAmount + deliveryCost,
    );

    return { totalTaxAmount, totalDiscountAmount, totalAmount };
  }

  private buildItemEntities(
    manager: EntityManager,
    deliveryNoteId: string,
    lines: ResolvedDeliveryNoteLine[],
  ): DeliveryNoteItem[] {
    const itemRepo = manager.getRepository(DeliveryNoteItem);
    return lines.map((line) =>
      itemRepo.create({
        deliveryNoteId,
        saleOrderItemId: line.saleOrderItemId,
        productId: line.productId,
        productFlavourId: line.productFlavourId,
        uomId: line.uomId,
        orderedQuantity: line.orderedQuantity,
        deliveredQuantity: line.deliveredQuantity,
        saleUnitPrice: line.saleUnitPrice,
        discountPercentage: line.discountPercentage,
        discountAmount: line.discountAmount,
        taxPercentage: line.taxPercentage,
        taxAmount: line.taxAmount,
        totalAmount: line.totalAmount,
      }),
    );
  }

  private async getApprovedDeliveredBySaleOrderItem(
    manager: EntityManager,
    saleOrderId: string,
  ): Promise<Map<string, number>> {
    const rows = await manager
      .getRepository(DeliveryNoteItem)
      .createQueryBuilder('item')
      .innerJoin('item.deliveryNote', 'deliveryNote')
      .where('deliveryNote.saleOrderId = :saleOrderId', { saleOrderId })
      .andWhere('deliveryNote.status = :status', {
        status: DeliveryNoteStatus.APPROVED,
      })
      .select('item.saleOrderItemId', 'saleOrderItemId')
      .addSelect('SUM(item.deliveredQuantity)', 'delivered')
      .groupBy('item.saleOrderItemId')
      .getRawMany<{ saleOrderItemId: string; delivered: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.saleOrderItemId, Number(row.delivered) || 0);
    }
    return map;
  }

  private resolveCreateLines(
    order: SaleOrder,
    dtoItems: CreateDeliveryNoteItemDto[] | undefined,
    priorDelivered: Map<string, number>,
    headerTaxPercentage: number,
  ): ResolvedDeliveryNoteLine[] {
    const saleOrderItemsById = new Map(
      (order.items ?? []).map((item) => [item.id, item]),
    );

    const inputItems =
      dtoItems ??
      (order.items ?? []).map((item) => ({
        saleOrderItemId: item.id,
        deliveredQuantity: item.quantity - (priorDelivered.get(item.id) ?? 0),
      }));

    const seen = new Set<string>();
    const lines: ResolvedDeliveryNoteLine[] = [];

    for (const input of inputItems) {
      if (seen.has(input.saleOrderItemId)) {
        throw new BadRequestException(
          `Sale order item ${input.saleOrderItemId} is duplicated`,
        );
      }
      seen.add(input.saleOrderItemId);

      const orderItem = saleOrderItemsById.get(input.saleOrderItemId);
      if (!orderItem) {
        throw new BadRequestException(
          `Sale order item ${input.saleOrderItemId} not found on this order`,
        );
      }

      if (input.deliveredQuantity < 0) {
        throw new BadRequestException('Delivered quantity cannot be negative');
      }

      if (input.deliveredQuantity > orderItem.quantity) {
        throw new BadRequestException(
          `Delivered quantity cannot exceed ordered quantity for product ${orderItem.productId}`,
        );
      }

      const alreadyDelivered = priorDelivered.get(orderItem.id) ?? 0;
      if (alreadyDelivered + input.deliveredQuantity > orderItem.quantity) {
        throw new BadRequestException(
          `Total delivered quantity would exceed ordered quantity for product ${orderItem.productId}`,
        );
      }

      if (input.deliveredQuantity === 0) {
        continue;
      }

      lines.push(
        this.resolveLineFromSaleOrderItem(
          orderItem,
          input.deliveredQuantity,
          headerTaxPercentage,
        ),
      );
    }

    if (!lines.length) {
      throw new BadRequestException(
        'At least one line with delivered quantity is required',
      );
    }

    return lines;
  }

  private async findApprovedSaleOrder(
    tenantDb: DataSource,
    businessId: string,
    saleOrderId: string,
  ): Promise<SaleOrder> {
    const order = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .innerJoin('so.warehouse', 'warehouse')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('so.customer', 'customer')
      .where('so.id = :saleOrderId', { saleOrderId })
      .andWhere('so.businessId = :businessId', { businessId })
      .andWhere('so.orderStatus = :status', { status: OrderStatus.APPROVED })
      .getOne();

    if (!order) {
      throw new NotFoundException(
        'Approved sale order not found for this business',
      );
    }
    if (!order.customer) {
      throw new BadRequestException('Sale order customer is required');
    }
    if (
      order.customer.type !== PartyType.CUSTOMER &&
      order.customer.type !== PartyType.BOTH
    ) {
      throw new BadRequestException('Sale order party must be a customer');
    }

    return order;
  }

  private async findDeliveryNoteForBusiness(
    tenantDb: DataSource,
    businessId: string,
    deliveryNoteId: string,
  ): Promise<DeliveryNote> {
    const deliveryNote = await tenantDb
      .getRepository(DeliveryNote)
      .createQueryBuilder('deliveryNote')
      .leftJoinAndSelect('deliveryNote.saleOrder', 'saleOrder')
      .leftJoinAndSelect('deliveryNote.warehouse', 'warehouse')
      .leftJoinAndSelect('deliveryNote.customer', 'customer')
      .leftJoinAndSelect('deliveryNote.items', 'items')
      .leftJoinAndSelect('items.saleOrderItem', 'saleOrderItem')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('deliveryNote.id = :deliveryNoteId', { deliveryNoteId })
      .andWhere('deliveryNote.businessId = :businessId', { businessId })
      .getOne();

    if (!deliveryNote) {
      throw new NotFoundException('Delivery note not found');
    }

    return deliveryNote;
  }

  private mapDeliveryNote(deliveryNote: DeliveryNote) {
    const items = (deliveryNote.items ?? []).map((item) => ({
      id: item.id,
      saleOrderItemId: item.saleOrderItemId,
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
      orderedQuantity: item.orderedQuantity,
      deliveredQuantity: item.deliveredQuantity,
      saleUnitPrice: item.saleUnitPrice,
      discountPercentage: item.discountPercentage,
      discountAmount: item.discountAmount,
      taxPercentage: item.taxPercentage,
      taxAmount: item.taxAmount,
      totalAmount: item.totalAmount,
    }));

    return {
      id: deliveryNote.id,
      businessId: deliveryNote.businessId,
      saleOrderId: deliveryNote.saleOrderId,
      saleOrder: deliveryNote.saleOrder
        ? {
            id: deliveryNote.saleOrder.id,
            orderNumber: deliveryNote.saleOrder.orderNumber,
            orderStatus: deliveryNote.saleOrder.orderStatus,
          }
        : null,
      warehouseId: deliveryNote.warehouseId,
      warehouse: deliveryNote.warehouse
        ? {
            id: deliveryNote.warehouse.id,
            name: deliveryNote.warehouse.name,
            code: deliveryNote.warehouse.code,
          }
        : null,
      customerId: deliveryNote.customerId,
      customer: deliveryNote.customer
        ? {
            id: deliveryNote.customer.id,
            code: deliveryNote.customer.code,
            name: deliveryNote.customer.name,
            type: deliveryNote.customer.type,
          }
        : null,
      deliveryNoteNumber: deliveryNote.deliveryNoteNumber,
      deliveryNoteDate: deliveryNote.deliveryNoteDate,
      notes: deliveryNote.notes,
      deliveryCost: deliveryNote.deliveryCost,
      totalTaxAmount: deliveryNote.totalTaxAmount,
      totalDiscountAmount: deliveryNote.totalDiscountAmount,
      totalAmount: deliveryNote.totalAmount,
      status: deliveryNote.status,
      items,
      createdAt: deliveryNote.createdAt,
      updatedAt: deliveryNote.updatedAt,
    };
  }

  private async executeDeliveryNoteApproval(
    manager: EntityManager,
    businessId: string,
    deliveryNote: DeliveryNote,
    customer: Party,
  ): Promise<DeliveryNote> {
    if (deliveryNote.status !== DeliveryNoteStatus.PENDING) {
      throw new BadRequestException('Only pending delivery notes can be approved');
    }

    const items = deliveryNote.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Delivery note must have at least one item to approve',
      );
    }
    if (!customer.receivableAccountId) {
      throw new BadRequestException(
        'Customer receivable account is required before approving delivery note',
      );
    }

    await this.stockService.consumeReservedStockOut(manager, {
      businessId,
      warehouseId: deliveryNote.warehouseId,
      referenceType: ReferenceType.SALE,
      lines: items
        .filter((item) => item.deliveredQuantity > 0)
        .map((item) => ({
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.deliveredQuantity,
        })),
    });

    await this.transactionService.postDirectLedgerEntry(manager, {
      businessId,
      chartOfAccountId: customer.receivableAccountId,
      referenceType: AccountTransactionReferenceType.DELIVERY_NOTE,
      referenceId: deliveryNote.id,
      partyId: customer.id,
      transactionDate: deliveryNote.deliveryNoteDate,
      description: `Delivery note ${deliveryNote.deliveryNoteNumber} - customer receivable`,
      debitAmount: this.roundAmount(Number(deliveryNote.totalAmount)),
    });

    deliveryNote.status = DeliveryNoteStatus.APPROVED;
    await manager.getRepository(DeliveryNote).save(deliveryNote);

    return manager.getRepository(DeliveryNote).findOneOrFail({
      where: { id: deliveryNote.id },
      relations: this.deliveryNoteRelations(),
    });
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateDeliveryNoteDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findApprovedSaleOrder(
      tenantDb,
      scopedBusinessId,
      dto.saleOrderId,
    );

    const taxPercentage = this.roundAmount(
      dto.taxPercentage ?? Number(order.taxPercentage),
    );
    const priorDelivered = await this.getApprovedDeliveredBySaleOrderItem(
      tenantDb.manager,
      order.id,
    );
    const resolvedLines = this.resolveCreateLines(
      order,
      dto.items,
      priorDelivered,
      taxPercentage,
    );
    const totals = this.computeDeliveryNoteTotals(resolvedLines, {
      deliveryCost: dto.deliveryCost,
      taxPercentage,
      discountPercentage: dto.discountPercentage ?? Number(order.discountPercentage),
    });

    const targetStatus = this.resolveCreateStatus(dto.status);
    const approveOnCreate = targetStatus === DeliveryNoteStatus.APPROVED;
    const customer = approveOnCreate
      ? await this.assertCustomerForApproval(
          tenantDb,
          scopedBusinessId,
          order.customerId,
        )
      : null;

    const deliveryNoteNumber =
      dto.deliveryNoteNumber?.trim() ||
      (await this.generateDeliveryNoteNumber(tenantDb));

    const existingNumber = await tenantDb.getRepository(DeliveryNote).findOne({
      where: { deliveryNoteNumber },
    });
    if (existingNumber) {
      throw new ConflictException(
        'Delivery note with this number already exists',
      );
    }

    const created = await tenantDb.transaction(async (manager) => {
      const deliveryNoteRepo = manager.getRepository(DeliveryNote);
      const deliveryNote = await deliveryNoteRepo.save(
        deliveryNoteRepo.create({
          businessId: scopedBusinessId,
          saleOrderId: order.id,
          warehouseId: order.warehouseId,
          customerId: order.customerId,
          deliveryNoteNumber,
          deliveryNoteDate: new Date(dto.deliveryNoteDate),
          notes: dto.notes?.trim() || null,
          deliveryCost: dto.deliveryCost ?? 0,
          totalTaxAmount: totals.totalTaxAmount,
          totalDiscountAmount: totals.totalDiscountAmount,
          totalAmount: totals.totalAmount,
          status: DeliveryNoteStatus.PENDING,
        }),
      );

      await manager
        .getRepository(DeliveryNoteItem)
        .save(this.buildItemEntities(manager, deliveryNote.id, resolvedLines));

      const loaded = await deliveryNoteRepo.findOneOrFail({
        where: { id: deliveryNote.id },
        relations: this.deliveryNoteRelations(),
      });

      if (approveOnCreate) {
        return this.executeDeliveryNoteApproval(
          manager,
          scopedBusinessId,
          loaded,
          customer!,
        );
      }

      return loaded;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: approveOnCreate
        ? 'DELIVERY_NOTE_CREATED_AND_APPROVED'
        : 'DELIVERY_NOTE_CREATED',
      description: approveOnCreate
        ? `Delivery note ${created.deliveryNoteNumber} created and approved from sale order ${order.orderNumber}`
        : `Delivery note ${created.deliveryNoteNumber} created from sale order ${order.orderNumber}`,
      metadata: {
        deliveryNoteId: created.id,
        deliveryNoteNumber: created.deliveryNoteNumber,
        saleOrderId: order.id,
        status: created.status,
      },
    });

    return { data: this.mapDeliveryNote(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      customerId?: string;
      warehouseId?: string;
      saleOrderId?: string;
      status?: DeliveryNoteStatus;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(DeliveryNote)
      .createQueryBuilder('deliveryNote')
      .leftJoinAndSelect('deliveryNote.saleOrder', 'saleOrder')
      .leftJoinAndSelect('deliveryNote.warehouse', 'warehouse')
      .leftJoinAndSelect('deliveryNote.customer', 'customer')
      .leftJoinAndSelect('deliveryNote.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where('deliveryNote.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.customerId) {
      qb.andWhere('deliveryNote.customerId = :customerId', {
        customerId: options.customerId,
      });
    }
    if (options.warehouseId) {
      qb.andWhere('deliveryNote.warehouseId = :warehouseId', {
        warehouseId: options.warehouseId,
      });
    }
    if (options.saleOrderId) {
      qb.andWhere('deliveryNote.saleOrderId = :saleOrderId', {
        saleOrderId: options.saleOrderId,
      });
    }
    if (options.status) {
      qb.andWhere('deliveryNote.status = :status', { status: options.status });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('deliveryNote.deliveryNoteNumber ILIKE :search', { search })
            .orWhere('customer.name ILIKE :search', { search })
            .orWhere('customer.code ILIKE :search', { search })
            .orWhere('saleOrder.orderNumber ILIKE :search', { search });
        }),
      );
    }

    const [deliveryNotes, total] = await qb
      .orderBy('deliveryNote.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DELIVERY_NOTE_LISTED',
      description: 'Delivery notes listed',
      metadata: { total, page, limit },
    });

    return {
      data: deliveryNotes.map((deliveryNote) =>
        this.mapDeliveryNote(deliveryNote),
      ),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    deliveryNoteId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const deliveryNote = await this.findDeliveryNoteForBusiness(
      tenantDb,
      scopedBusinessId,
      deliveryNoteId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DELIVERY_NOTE_VIEWED',
      description: `Delivery note ${deliveryNote.deliveryNoteNumber} viewed`,
      metadata: { deliveryNoteId: deliveryNote.id },
    });

    return { data: this.mapDeliveryNote(deliveryNote) };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    deliveryNoteId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const deliveryNote = await this.findDeliveryNoteForBusiness(
      tenantDb,
      scopedBusinessId,
      deliveryNoteId,
    );

    if (deliveryNote.status === DeliveryNoteStatus.APPROVED) {
      return {
        data: this.mapDeliveryNote(deliveryNote),
        message: 'Delivery note is already approved',
      };
    }

    const customer = await this.assertCustomerForApproval(
      tenantDb,
      scopedBusinessId,
      deliveryNote.customerId,
    );

    const approved = await tenantDb.transaction(async (manager) =>
      this.executeDeliveryNoteApproval(
        manager,
        scopedBusinessId,
        deliveryNote,
        customer,
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DELIVERY_NOTE_APPROVED',
      description: `Delivery note ${approved.deliveryNoteNumber} approved - stock issued, customer receivable debited`,
      metadata: {
        deliveryNoteId: approved.id,
        totalAmount: approved.totalAmount,
      },
    });

    return { data: this.mapDeliveryNote(approved) };
  }
}
