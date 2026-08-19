import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, In, IsNull } from 'typeorm';
import { OrderStatus, SaleOrder, SaleOrderItem } from 'src/tenant-db/entities/sale-order.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  DeliveryNote,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleReturn } from 'src/tenant-db/entities/sale-return.entity';
import { SaleReturnVoucher } from 'src/tenant-db/entities/sale-return-voucher.entity';
import {
  Product,
  ProductFlavour,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { CreateSaleOrderDto } from '../../dto/sale-order/create-sale-order.dto';
import { CreateSaleOrderItemDto } from '../../dto/sale-order/create-sale-order-item.dto';
import { UpdateSaleOrderDto } from '../../dto/sale-order/update-sale-order.dto';
import { UpdateSaleOrderItemDto } from '../../dto/sale-order/update-sale-order-item.dto';
import { EditApprovedSaleOrderDto } from '../../dto/sale-order/edit-approved-sale-order.dto';
import { EditApprovedSaleOrderItemDto } from '../../dto/sale-order/edit-approved-sale-order-item.dto';
import * as XLSX from 'xlsx';
import { ActivityLogService } from '../activity-log.service';
import {
  ListAnalyticsModule,
  ListAnalyticsService,
} from '../list-analytics.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import { StockService } from '../stock.service';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { DeliveryNoteService } from './delivery-note.service';
import { SaleReturnService } from './sale-return.service';
import { SaleReturnVoucherService } from '../vouchers/sale-return-voucher.service';

const ORDER_NUMBER_PREFIX = 'SO';

type ResolvedSaleOrderLine = {
  warehouseId: string;
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  quantity: number;
  purchaseUnitPrice: number;
  saleUnitPrice: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
};

type SaleOrderTotals = {
  orderTotal: number;
  taxPercentage: number;
  taxAmount: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
};

type SaleOrderImportRow = {
  row: number;
  orderNumber: string;
  customerName: string;
  orderDate: string;
};

type SaleOrderItemImportRow = {
  row: number;
  orderNumber: string;
  productTitle: string;
  quantity: number;
  measurementUnit: string;
  purchaseUnitPrice: number;
  saleUnitPrice: number;
  discountPercentage: number;
  warehouseId: string;
};

@Injectable()
export class SaleOrderService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly deliveryNoteService: DeliveryNoteService,
    private readonly saleReturnService: SaleReturnService,
    private readonly saleReturnVoucherService: SaleReturnVoucherService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
    private readonly listAnalyticsService: ListAnalyticsService,
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

  private async generateOrderNumber(tenantDb: DataSource): Promise<string> {
    const last = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .where('so.orderNumber LIKE :prefix', {
        prefix: `${ORDER_NUMBER_PREFIX}-%`,
      })
      .orderBy('so.orderNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.orderNumber.replace(`${ORDER_NUMBER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${ORDER_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async resolveOrderNumber(
    tenantDb: DataSource,
    orderNumber?: string,
  ): Promise<string> {
    const resolved =
      orderNumber?.trim() || (await this.generateOrderNumber(tenantDb));

    const existing = await tenantDb
      .getRepository(SaleOrder)
      .findOne({ where: { orderNumber: resolved } });

    if (existing) {
      throw new ConflictException(
        'Sale order with this order number already exists',
      );
    }

    return resolved;
  }

  private async assertCustomerForBusiness(
    tenantDb: DataSource,
    businessId: string,
    customerId: string,
  ): Promise<Party> {
    const customer = await tenantDb.getRepository(Party).findOne({
      where: { id: customerId, businessId, deletedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (
      customer.type !== PartyType.CUSTOMER &&
      customer.type !== PartyType.BOTH
    ) {
      throw new BadRequestException('Party must be a customer');
    }

    return customer;
  }

  private assertPendingStatus(order: SaleOrder): void {
    if (order.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending sale orders can be modified or deleted',
      );
    }
  }

  private assertApprovedStatus(order: SaleOrder): void {
    if (order.orderStatus !== OrderStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved sale orders can be edited with this endpoint',
      );
    }
  }

  private async assertNoSaleReturnsOnOrder(
    tenantDb: DataSource,
    businessId: string,
    orderId: string,
  ): Promise<void> {
    const count = await tenantDb
      .getRepository(SaleReturn)
      .createQueryBuilder('saleReturn')
      .innerJoin('saleReturn.saleInvoice', 'invoice')
      .innerJoin('invoice.deliveryNote', 'deliveryNote')
      .where('deliveryNote.saleOrderId = :orderId', { orderId })
      .andWhere('invoice.businessId = :businessId', { businessId })
      .getCount();

    if (count > 0) {
      throw new BadRequestException(
        'Cannot edit sale order with existing sale returns',
      );
    }
  }

  private async syncApprovedOrderItems(
    manager: EntityManager,
    orderId: string,
    items: EditApprovedSaleOrderItemDto[],
    existingItems: SaleOrderItem[],
  ): Promise<void> {
    if (items.length !== existingItems.length) {
      throw new BadRequestException(
        'All sale order line items must be included',
      );
    }

    const existingById = new Map(existingItems.map((row) => [row.id, row]));
    const payloadIds = new Set(items.map((item) => item.id));

    for (const existing of existingItems) {
      if (!payloadIds.has(existing.id)) {
        throw new BadRequestException(
          'All sale order line items must be included',
        );
      }
    }

    const itemRepo = manager.getRepository(SaleOrderItem);

    for (const item of items) {
      const existing = existingById.get(item.id);
      if (!existing || existing.saleOrderId !== orderId) {
        throw new NotFoundException(`Sale order item ${item.id} not found`);
      }

      if (item.quantity !== existing.quantity) {
        throw new BadRequestException(
          `Quantity cannot be changed for sale order item ${item.id}`,
        );
      }

      const purchaseUnitPrice = this.roundAmount(item.purchaseUnitPrice);
      const saleUnitPrice = this.roundAmount(
        item.saleUnitPrice != null
          ? Number(item.saleUnitPrice)
          : Number(existing.saleUnitPrice),
      );
      const lineSubtotal = saleUnitPrice * item.quantity;
      let discountPercentage =
        item.discountPercentage ?? Number(existing.discountPercentage);
      let discountAmount: number;
      if (item.discountAmount != null) {
        discountAmount = this.roundAmount(item.discountAmount);
        discountPercentage =
          lineSubtotal > 0
            ? this.roundAmount((discountAmount / lineSubtotal) * 100)
            : 0;
      } else {
        discountAmount = this.roundAmount(
          (lineSubtotal * discountPercentage) / 100,
        );
      }
      const totalAmount = this.roundAmount(lineSubtotal - discountAmount);

      await itemRepo.update(existing.id, {
        purchaseUnitPrice,
        saleUnitPrice,
        discountPercentage: this.roundAmount(discountPercentage),
        discountAmount,
        totalAmount,
      });
    }
  }

  private defaultSaleUnitPriceFromPricing(
    purchaseUnitPrice: number,
    pricing: ProductPricing,
  ): number {
    return this.roundAmount(
      Number(purchaseUnitPrice) + Number(pricing.saleUnitMarginAmount),
    );
  }

  private resolveLineItem(
    item: CreateSaleOrderItemDto,
    pricing: ProductPricing,
  ): ResolvedSaleOrderLine {
    const purchaseUnitPrice = Number(
      item.purchaseUnitPrice ?? pricing.purchaseUnitPrice,
    );
    const saleUnitPrice = this.roundAmount(
      item.saleUnitPrice != null
        ? Number(item.saleUnitPrice)
        : this.defaultSaleUnitPriceFromPricing(purchaseUnitPrice, pricing),
    );

    const discountPercentage = item.discountPercentage ?? 0;
    const lineSubtotal = saleUnitPrice * item.quantity;
    const discountAmount = this.roundAmount(
      (lineSubtotal * discountPercentage) / 100,
    );
    const totalAmount = this.roundAmount(lineSubtotal - discountAmount);

    return {
      warehouseId: item.warehouseId,
      productId: item.productId,
      uomId: item.uomId,
      productFlavourId: item.productFlavourId ?? null,
      quantity: item.quantity,
      purchaseUnitPrice: this.roundAmount(purchaseUnitPrice),
      saleUnitPrice,
      discountPercentage: this.roundAmount(discountPercentage),
      discountAmount,
      totalAmount,
    };
  }

  private computeOrderTotals(
    lines: ResolvedSaleOrderLine[],
    options: {
      taxPercentage?: number;
      discountPercentage?: number;
      discountAmount?: number;
      taxAmount?: number;
    },
  ): SaleOrderTotals {
    const orderTotal = this.roundAmount(
      lines.reduce((sum, line) => sum + line.totalAmount, 0),
    );
    const discountPercentage = this.roundAmount(options.discountPercentage ?? 0);
    const discountAmount =
      options.discountAmount != null
        ? this.roundAmount(options.discountAmount)
        : this.roundAmount((orderTotal * discountPercentage) / 100);
    const taxableBase = this.roundAmount(orderTotal - discountAmount);
    const taxPercentage = this.roundAmount(options.taxPercentage ?? 0);
    const taxAmount =
      options.taxAmount != null
        ? this.roundAmount(options.taxAmount)
        : this.roundAmount((taxableBase * taxPercentage) / 100);
    const totalAmount = this.roundAmount(taxableBase + taxAmount);

    return {
      orderTotal,
      taxPercentage,
      taxAmount,
      discountPercentage,
      discountAmount,
      totalAmount,
    };
  }

  private async assertWarehouseForBusiness(
    manager: EntityManager,
    businessId: string,
    warehouseId: string,
  ): Promise<void> {
    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${warehouseId} not found`);
    }
  }

  private async validateLineItems(
    manager: EntityManager,
    businessId: string,
    items: CreateSaleOrderItemDto[],
  ): Promise<Map<string, ProductPricing>> {
    const warehouseIds = [...new Set(items.map((item) => item.warehouseId))];
    for (const warehouseId of warehouseIds) {
      await this.assertWarehouseForBusiness(manager, businessId, warehouseId);
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const uomIds = [...new Set(items.map((item) => item.uomId))];

    const products = await manager.getRepository(Product).find({
      where: { id: In(productIds), businessId, isDelete: false },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }

    const uoms = await manager.getRepository(Uom).find({
      where: { id: In(uomIds), businessId },
    });

    if (uoms.length !== uomIds.length) {
      throw new NotFoundException('One or more UOMs were not found');
    }

    const pricingByKey = new Map<string, ProductPricing>();

    for (const item of items) {
      const pricing = await manager.getRepository(ProductPricing).findOne({
        where: { productId: item.productId, uomId: item.uomId },
      });

      if (!pricing) {
        throw new BadRequestException(
          `Product ${item.productId} has no pricing for UOM ${item.uomId}`,
        );
      }

      if (item.productFlavourId != null) {
        const flavour = await manager.getRepository(ProductFlavour).findOne({
          where: {
            id: item.productFlavourId,
            productId: item.productId,
          },
        });

        if (!flavour) {
          throw new BadRequestException(
            `Flavour ${item.productFlavourId} does not belong to product ${item.productId}`,
          );
        }
      }

      pricingByKey.set(`${item.productId}:${item.uomId}`, pricing);
    }

    return pricingByKey;
  }

  private buildResolvedLines(
    items: CreateSaleOrderItemDto[],
    pricingByKey: Map<string, ProductPricing>,
  ): ResolvedSaleOrderLine[] {
    return items.map((item) => {
      const pricing = pricingByKey.get(`${item.productId}:${item.uomId}`);
      if (!pricing) {
        throw new BadRequestException(
          `Product ${item.productId} has no pricing for UOM ${item.uomId}`,
        );
      }
      return this.resolveLineItem(item, pricing);
    });
  }

  private buildItemEntities(
    manager: EntityManager,
    saleOrderId: string,
    lines: ResolvedSaleOrderLine[],
  ): SaleOrderItem[] {
    const itemRepo = manager.getRepository(SaleOrderItem);
    return lines.map((line) =>
      itemRepo.create({
        saleOrderId,
        warehouseId: line.warehouseId,
        productId: line.productId,
        productFlavourId: line.productFlavourId,
        uomId: line.uomId,
        purchaseUnitPrice: line.purchaseUnitPrice,
        saleUnitPrice: line.saleUnitPrice,
        quantity: line.quantity,
        discountPercentage: line.discountPercentage,
        discountAmount: line.discountAmount,
        totalAmount: line.totalAmount,
      }),
    );
  }

  private orderRelations() {
    return {
      customer: true,
      createdByUser: true,
      items: {
        product: true,
        productFlavour: { flavour: true },
        uom: true,
        warehouse: true,
      },
    } as const;
  }

  private mapSaleWorkflowDeliveryNote(deliveryNote: DeliveryNote) {
    return {
      id: deliveryNote.id,
      deliveryNoteNumber: deliveryNote.deliveryNoteNumber,
      deliveryNoteDate: deliveryNote.deliveryNoteDate,
      status: deliveryNote.status,
      totalTaxAmount: deliveryNote.totalTaxAmount,
      totalDiscountAmount: deliveryNote.totalDiscountAmount,
      totalAmount: deliveryNote.totalAmount,
    };
  }

  private mapSaleWorkflowInvoice(invoice: SaleInvoice | null) {
    if (!invoice) {
      return null;
    }

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      totalTaxAmount: invoice.totalTaxAmount,
      totalDiscountAmount: invoice.totalDiscountAmount,
      totalAmount: invoice.totalAmount,
    };
  }

  private mapSaleOrder(order: SaleOrder) {
    const items = (order.items ?? []).map((item) => ({
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
      uom: item.uom
        ? {
            id: item.uom.id,
            name: item.uom.name,
          }
        : null,
      purchaseUnitPrice: item.purchaseUnitPrice,
      saleUnitPrice: item.saleUnitPrice,
      quantity: item.quantity,
      discountPercentage: item.discountPercentage,
      discountAmount: item.discountAmount,
      totalAmount: item.totalAmount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customer: order.customer
        ? {
            id: order.customer.id,
            code: order.customer.code,
            name: order.customer.name,
            type: order.customer.type,
          }
        : null,
      orderStatus: order.orderStatus,
      orderTotal: order.orderTotal,
      taxPercentage: order.taxPercentage,
      taxAmount: order.taxAmount,
      discountPercentage: order.discountPercentage,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      notes: order.notes,
      orderDate: order.orderDate,
      createdBy: order.createdBy,
      createdByUser: order.createdByUser
        ? {
            id: order.createdByUser.id,
            name: order.createdByUser.name,
            email: order.createdByUser.email,
          }
        : null,
      items,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async findOrderForBusiness(
    tenantDb: DataSource,
    businessId: string,
    orderId: string,
  ): Promise<SaleOrder> {
    const order = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.createdByUser', 'createdByUser')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('so.id = :orderId', { orderId })
      .andWhere('so.businessId = :businessId', { businessId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    return order;
  }

  private async reserveSaleOrderStock(
    manager: EntityManager,
    businessId: string,
    order: SaleOrder,
  ): Promise<void> {
    const items = order.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Sale order must have at least one item to approve',
      );
    }

    await this.stockService.reserveStock(manager, {
      businessId,
      lines: items
        .filter((item) => item.quantity > 0)
        .map((item) => ({
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
          warehouseId: item.warehouseId,
        })),
    });
  }

  private async createOrderWithStatus(
    tenantDb: DataSource,
    params: {
      businessId: string;
      actorUserId: string;
      orderStatus: OrderStatus;
      dto: CreateSaleOrderDto;
    },
  ): Promise<SaleOrder> { 
    await this.assertCustomerForBusiness(
      tenantDb,
      params.businessId,
      params.dto.customerId,
    );

    const orderNumber = await this.resolveOrderNumber(
      tenantDb,
      params.dto.orderNumber,
    );

    return tenantDb.transaction(async (manager) => {
      const pricingByKey = await this.validateLineItems(
        manager,
        params.businessId,
        params.dto.items,
      );
      const resolvedLines = this.buildResolvedLines(
        params.dto.items,
        pricingByKey,
      );
      const totals = this.computeOrderTotals(resolvedLines, {
        taxPercentage: params.dto.taxPercentage,
        discountPercentage: params.dto.discountPercentage,
      });

      const orderRepo = manager.getRepository(SaleOrder);
      const order = await orderRepo.save(
        orderRepo.create({
          orderNumber,
          deliveryCost: params.dto.deliveryCost,
          customerId: params.dto.customerId,
          businessId: params.businessId,
          orderStatus: params.orderStatus,
          orderTotal: totals.orderTotal,
          taxPercentage: totals.taxPercentage,
          taxAmount: totals.taxAmount,
          discountPercentage: totals.discountPercentage,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          notes: params.dto.notes?.trim() || null,
          createdBy: params.actorUserId,
          orderDate: new Date(params.dto.orderDate),
        }),
      );

      await manager
        .getRepository(SaleOrderItem)
        .save(this.buildItemEntities(manager, order.id, resolvedLines));

      const loaded = await orderRepo.findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });

      if (params.orderStatus === OrderStatus.APPROVED) {
        await this.reserveSaleOrderStock(manager, params.businessId, loaded);
      }

      return loaded;
    });
  }

  private async syncOrderItems(
    manager: EntityManager,
    businessId: string,
    orderId: string,
    items: UpdateSaleOrderItemDto[],
    existingItems: SaleOrderItem[],
  ): Promise<void> {
    const pricingByKey = await this.validateLineItems(manager, businessId, items);
    const resolvedLines = this.buildResolvedLines(items, pricingByKey);

    const itemRepo = manager.getRepository(SaleOrderItem);
    const existingById = new Map(existingItems.map((row) => [row.id, row]));
    const keptItemIds = new Set<string>();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const line = resolvedLines[index];

      if (item.id) {
        const existing = existingById.get(item.id);
        if (!existing || existing.saleOrderId !== orderId) {
          throw new NotFoundException(`Sale order item ${item.id} not found`);
        }
        keptItemIds.add(item.id);
        await itemRepo.update(existing.id, {
          warehouseId: line.warehouseId,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitPrice: line.saleUnitPrice,
          quantity: line.quantity,
          discountPercentage: line.discountPercentage,
          discountAmount: line.discountAmount,
          totalAmount: line.totalAmount,
        });
        continue;
      }

      await itemRepo.save(
        itemRepo.create({
          saleOrderId: orderId,
          warehouseId: line.warehouseId,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitPrice: line.saleUnitPrice,
          quantity: line.quantity,
          discountPercentage: line.discountPercentage,
          discountAmount: line.discountAmount,
          totalAmount: line.totalAmount,
        }),
      );
    }

    const idsToRemove = existingItems
      .filter((row) => !keptItemIds.has(row.id))
      .map((row) => row.id);

    if (idsToRemove.length > 0) {
      await itemRepo.delete({
        id: In(idsToRemove),
        saleOrderId: orderId,
      });
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const created = await this.createOrderWithStatus(tenantDb, {
      businessId: scopedBusinessId,
      actorUserId,
      orderStatus: OrderStatus.PENDING,
      dto,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_CREATED',
      description: `Sale order ${created.orderNumber} created`,
      metadata: {
        saleOrderId: created.id,
        orderNumber: created.orderNumber,
        orderStatus: created.orderStatus,
      },
    });

    return { data: this.mapSaleOrder(created) };
  }

  async createAndApproved(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const created = await this.createOrderWithStatus(tenantDb, {
      businessId: scopedBusinessId,
      actorUserId,
      orderStatus: OrderStatus.APPROVED,
      dto,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_CREATED_AND_APPROVED',
      description: `Sale order ${created.orderNumber} created, approved, and stock reserved`,
      metadata: {
        saleOrderId: created.id,
        orderNumber: created.orderNumber,
      },
    });

    return { data: this.mapSaleOrder(created) };
  }

  async createApproveAndSale(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const customer = await this.assertCustomerForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.customerId,
    );

    if (!customer.receivableAccountId) {
      throw new BadRequestException(
        'Customer receivable account is required before approving delivery note',
      );
    }

    const orderNumber = await this.resolveOrderNumber(
      tenantDb,
      dto.orderNumber,
    );
    const pricingByKey = await this.validateLineItems(
      tenantDb.manager,
      scopedBusinessId,
      dto.items,
    );
    const resolvedLines = this.buildResolvedLines(dto.items, pricingByKey);
    const totals = this.computeOrderTotals(resolvedLines, {
      taxPercentage: dto.taxPercentage,
      discountPercentage: dto.discountPercentage,
    });

    const created = await tenantDb.transaction(async (manager) => {
      const orderRepo = manager.getRepository(SaleOrder);
      const order = await orderRepo.save(
        orderRepo.create({
          orderNumber,
          deliveryCost: dto.deliveryCost ?? 0,
          customerId: dto.customerId,
          businessId: scopedBusinessId,
          orderStatus: OrderStatus.APPROVED,
          orderTotal: totals.orderTotal,
          taxPercentage: totals.taxPercentage,
          taxAmount: totals.taxAmount,
          discountPercentage: totals.discountPercentage,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          notes: dto.notes?.trim() || null,
          createdBy: actorUserId,
          orderDate: new Date(dto.orderDate),
        }),
      );

      await manager
        .getRepository(SaleOrderItem)
        .save(this.buildItemEntities(manager, order.id, resolvedLines));

      const loadedOrder = await orderRepo.findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });

      await this.reserveSaleOrderStock(manager, scopedBusinessId, loadedOrder);

      const deliveryNote = await this.deliveryNoteService.createApprovedFromOrder(
        manager,
        {
          businessId: scopedBusinessId,
          order: loadedOrder,
          deliveryNoteDate: new Date(dto.orderDate),
          deliveryCost: dto.deliveryCost,
          taxPercentage: dto.taxPercentage,
          discountPercentage: dto.discountPercentage,
          notes: dto.notes,
          actorUserId,
        },
      );

      const saleInvoice = await manager.getRepository(SaleInvoice).findOne({
        where: { deliveryNoteId: deliveryNote.id, deletedAt: IsNull() },
      });

      return { order: loadedOrder, deliveryNote, saleInvoice };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_CREATED_APPROVED_AND_SOLD',
      description: `Sale order ${created.order.orderNumber} created, approved, and sold`,
      metadata: {
        saleOrderId: created.order.id,
        orderNumber: created.order.orderNumber,
        deliveryNoteId: created.deliveryNote.id,
        deliveryNoteNumber: created.deliveryNote.deliveryNoteNumber,
        saleInvoiceId: created.saleInvoice?.id ?? null,
        invoiceNumber: created.saleInvoice?.invoiceNumber ?? null,
      },
    });

    return {
      data: {
        saleOrder: this.mapSaleOrder(created.order),
        deliveryNote: this.mapSaleWorkflowDeliveryNote(created.deliveryNote),
        saleInvoice: this.mapSaleWorkflowInvoice(created.saleInvoice),
      },
    };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      customerId?: string;
      orderStatus?: OrderStatus;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.createdByUser', 'createdByUser')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('so.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.customerId) {
      qb.andWhere('so.customerId = :customerId', {
        customerId: options.customerId,
      });
    }

    if (options.orderStatus) {
      qb.andWhere('so.orderStatus = :orderStatus', {
        orderStatus: options.orderStatus,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('so.orderNumber ILIKE :search', { search })
            .orWhere('customer.name ILIKE :search', { search })
            .orWhere('customer.code ILIKE :search', { search })
            ;
        }),
      );
    }

    const [[orders, total], analytics] = await Promise.all([
      qb
        .orderBy('so.orderDate', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount(),
      this.listAnalyticsService.getDocumentAnalytics(
        tenantDb,
        scopedBusinessId,
        ListAnalyticsModule.SALE_ORDER,
      ),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_LISTED',
      description: 'Sale orders listed',
      metadata: { total, page, limit },
    });

    return {
      data: orders.map((order) => this.mapSaleOrder(order)),
      meta: { total, page, limit },
      analytics,
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_VIEWED',
      description: `Sale order ${order.orderNumber} viewed`,
      metadata: { saleOrderId: order.id },
    });

    return { data: this.mapSaleOrder(order) };
  }

  async getProductSaleHistory(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { customerId: string; productId: string; uomId?: string },
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const customerId = options.customerId?.trim();
    const productId = options.productId?.trim();
    const uomId = options.uomId?.trim();

    if (!customerId) {
      throw new BadRequestException('Customer ID is required');
    }
    if (!productId) {
      throw new BadRequestException('Product ID is required');
    }

    const qb = tenantDb
      .getRepository(SaleOrderItem)
      .createQueryBuilder('soi')
      .innerJoinAndSelect('soi.saleOrder', 'so')
      .leftJoinAndSelect('soi.uom', 'uom')
      .where('so.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('so.customerId = :customerId', { customerId })
      .andWhere('soi.productId = :productId', { productId })
      .andWhere('so.orderStatus = :orderStatus', {
        orderStatus: OrderStatus.APPROVED,
      });

    if (uomId) {
      qb.andWhere('soi.uomId = :uomId', { uomId });
    }

    const rows = await qb
      .orderBy('so.orderDate', 'DESC')
      .addOrderBy('so.createdAt', 'DESC')
      .addOrderBy('soi.createdAt', 'DESC')
      .take(3)
      .getMany();

    return {
      data: rows.map((item) => ({
        saleOrderId: item.saleOrderId,
        orderNumber: item.saleOrder.orderNumber,
        orderDate: item.saleOrder.orderDate,
        saleUnitPrice: Number(item.saleUnitPrice),
        quantity: item.quantity,
        uomId: item.uomId,
        uom: item.uom
          ? {
              id: item.uom.id,
              name: item.uom.name,
            }
          : null,
      })),
    };
  }

  async viewByCode(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderNumber: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const code = orderNumber?.trim();
    if (!code) {
      throw new BadRequestException('Sale order code is required');
    }

    const match = await this.findSaleOrderByNumberForBusiness(
      tenantDb,
      scopedBusinessId,
      code,
    );
    if (!match) {
      throw new NotFoundException('Sale order not found');
    }

    return this.view(tenantDb, scopedBusinessId, match.id, actorUserId);
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    dto: UpdateSaleOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );
    this.assertPendingStatus(order);

    if (dto.orderNumber !== undefined) {
      const nextNumber = dto.orderNumber.trim();
      if (!nextNumber) {
        throw new BadRequestException('Order number cannot be empty');
      }
      if (nextNumber !== order.orderNumber) {
        const taken = await tenantDb
          .getRepository(SaleOrder)
          .findOne({ where: { orderNumber: nextNumber } });
        if (taken) {
          throw new ConflictException(
            'Sale order with this order number already exists',
          );
        }
        order.orderNumber = nextNumber;
      }
    }
    if (dto.deliveryCost !== undefined) {
      order.deliveryCost = dto.deliveryCost;
    }

    if (dto.orderDate !== undefined) {
      order.orderDate = new Date(dto.orderDate);
    }

    if (dto.notes !== undefined) {
      order.notes = dto.notes?.trim() || null;
    }

    const existingItems = [...(order.items ?? [])];

    const updated = await tenantDb.transaction(async (manager) => {
      if (dto.items !== undefined) {
        await this.syncOrderItems(
          manager,
          scopedBusinessId,
          order.id,
          dto.items,
          existingItems,
        );
      }

      const itemsForTotals: CreateSaleOrderItemDto[] =
        dto.items ??
        existingItems.map((item) => ({
          warehouseId: item.warehouseId,
          productId: item.productId,
          uomId: item.uomId,
          productFlavourId: item.productFlavourId ?? undefined,
          quantity: item.quantity,
          purchaseUnitPrice: Number(item.purchaseUnitPrice),
          saleUnitPrice: Number(item.saleUnitPrice),
          discountPercentage: Number(item.discountPercentage),
        }));

      const pricingByKey = await this.validateLineItems(
        manager,
        scopedBusinessId,
        itemsForTotals,
      );
      const resolvedLines = this.buildResolvedLines(itemsForTotals, pricingByKey);
      const totals = this.computeOrderTotals(resolvedLines, {
        taxPercentage: dto.taxPercentage ?? order.taxPercentage,
        discountPercentage:
          dto.discountPercentage ?? order.discountPercentage,
      });

      await manager.getRepository(SaleOrder).update(order.id, {
        orderNumber: order.orderNumber,
        deliveryCost: order.deliveryCost,
        customerId: order.customerId,
        orderDate: order.orderDate,
        notes: order.notes,
        orderTotal: totals.orderTotal,
        taxPercentage: totals.taxPercentage,
        taxAmount: totals.taxAmount,
        discountPercentage: totals.discountPercentage,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
      });

      return manager.getRepository(SaleOrder).findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_UPDATED',
      description: `Sale order ${updated.orderNumber} updated`,
      metadata: { saleOrderId: updated.id },
    });

    return { data: this.mapSaleOrder(updated) };
  }

  async editApproved(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    dto: EditApprovedSaleOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );
    this.assertApprovedStatus(order);
    await this.assertNoSaleReturnsOnOrder(
      tenantDb,
      scopedBusinessId,
      order.id,
    );

    const existingItems = [...(order.items ?? [])];
    if (!existingItems.length) {
      throw new BadRequestException('Sale order has no line items');
    }

    const hasApprovedDn = await tenantDb.getRepository(DeliveryNote).exists({
      where: {
        saleOrderId: order.id,
        status: DeliveryNoteStatus.APPROVED,
      },
    });

    const customer = order.customer;
    if (!customer) {
      throw new NotFoundException('Customer not found on sale order');
    }
    if (hasApprovedDn && !customer.receivableAccountId) {
      throw new BadRequestException(
        'Customer receivable account is required before editing sale order with approved delivery notes',
      );
    }

    const updated = await tenantDb.transaction(async (manager) => {
      await this.syncApprovedOrderItems(
        manager,
        order.id,
        dto.items,
        existingItems,
      );

      const syncedItems = await manager.getRepository(SaleOrderItem).find({
        where: { saleOrderId: order.id },
      });

      const resolvedLines: ResolvedSaleOrderLine[] = syncedItems.map((item) => ({
        warehouseId: item.warehouseId,
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId ?? null,
        quantity: item.quantity,
        purchaseUnitPrice: Number(item.purchaseUnitPrice),
        saleUnitPrice: Number(item.saleUnitPrice),
        discountPercentage: Number(item.discountPercentage),
        discountAmount: Number(item.discountAmount),
        totalAmount: Number(item.totalAmount),
      }));

      const totals = this.computeOrderTotals(resolvedLines, {
        taxPercentage: dto.taxPercentage ?? order.taxPercentage,
        discountPercentage:
          dto.discountPercentage ?? order.discountPercentage,
        discountAmount: dto.discountAmount ?? order.discountAmount,
        taxAmount: dto.taxAmount ?? order.taxAmount,
      });

      const orderDate = new Date(dto.orderDate);

      await manager.getRepository(SaleOrder).update(order.id, {
        orderDate,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : order.notes,
        deliveryCost: dto.deliveryCost ?? order.deliveryCost,
        orderTotal: totals.orderTotal,
        taxPercentage: totals.taxPercentage,
        taxAmount: totals.taxAmount,
        discountPercentage: totals.discountPercentage,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
      });

      const orderForCascade = await manager
        .getRepository(SaleOrder)
        .findOneOrFail({ where: { id: order.id } });
      orderForCascade.items = await manager.getRepository(SaleOrderItem).find({
        where: { saleOrderId: order.id },
      });
      orderForCascade.orderDate = orderDate;
      orderForCascade.deliveryCost = dto.deliveryCost ?? order.deliveryCost;
      orderForCascade.orderTotal = totals.orderTotal;
      orderForCascade.taxPercentage = totals.taxPercentage;
      orderForCascade.taxAmount = totals.taxAmount;
      orderForCascade.discountPercentage = totals.discountPercentage;
      orderForCascade.discountAmount = totals.discountAmount;
      orderForCascade.totalAmount = totals.totalAmount;

      await this.deliveryNoteService.cascadeFromSaleOrder(
        manager,
        scopedBusinessId,
        orderForCascade,
        customer,
      );

      return manager.getRepository(SaleOrder).findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_EDITED_APPROVED',
      description: `Approved sale order ${updated.orderNumber} edited`,
      metadata: { saleOrderId: updated.id },
    });

    return { data: this.mapSaleOrder(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );

    const cascaded: {
      deliveryNoteIds: string[];
      invoiceIds: string[];
      saleReturnIds: string[];
      saleReturnVoucherIds: string[];
    } = {
      deliveryNoteIds: [],
      invoiceIds: [],
      saleReturnIds: [],
      saleReturnVoucherIds: [],
    };

    if (
      order.orderStatus === OrderStatus.PENDING ||
      order.orderStatus === OrderStatus.REJECTED
    ) {
      await tenantDb.getRepository(SaleOrder).remove(order);
    } else {
      await tenantDb.transaction(async (manager) => {
        const deliveryNotes = await manager.getRepository(DeliveryNote).find({
          where: { saleOrderId: order.id },
          relations: { items: { saleOrderItem: true }, customer: true },
        });
        const invoices = await manager.getRepository(SaleInvoice).find({
          where: { saleOrderId: order.id },
        });
        const invoiceIds = invoices.map((invoice) => invoice.id);
        const saleReturns = invoiceIds.length
          ? await manager.getRepository(SaleReturn).find({
              where: { saleInvoiceId: In(invoiceIds) },
              relations: { saleReturnItems: true },
            })
          : [];
        const returnVouchers = invoiceIds.length
          ? await manager.getRepository(SaleReturnVoucher).find({
              where: { invoiceId: In(invoiceIds) },
            })
          : [];

        cascaded.deliveryNoteIds = deliveryNotes.map((row) => row.id);
        cascaded.invoiceIds = invoiceIds;
        cascaded.saleReturnIds = saleReturns.map((row) => row.id);
        cascaded.saleReturnVoucherIds = returnVouchers.map((row) => row.id);

        const deliveredByItem = new Map<string, number>();
        for (const deliveryNote of deliveryNotes) {
          if (deliveryNote.status !== DeliveryNoteStatus.APPROVED) {
            continue;
          }
          for (const item of deliveryNote.items ?? []) {
            deliveredByItem.set(
              item.saleOrderItemId,
              (deliveredByItem.get(item.saleOrderItemId) ?? 0) +
                Number(item.deliveredQuantity),
            );
          }
        }

        for (const voucher of returnVouchers) {
          await this.saleReturnVoucherService.deleteInManager(
            manager,
            scopedBusinessId,
            voucher.id,
          );
        }

        for (const saleReturn of saleReturns) {
          await this.saleReturnService.removeForOrderCascade(
            manager,
            scopedBusinessId,
            saleReturn,
          );
        }

        for (const deliveryNote of deliveryNotes) {
          await this.deliveryNoteService.reverseApprovedEffects(
            manager,
            scopedBusinessId,
            deliveryNote,
          );
        }

        if (invoiceIds.length) {
          await manager.getRepository(SaleInvoice).delete(invoiceIds);
        }
        if (deliveryNotes.length) {
          await manager.getRepository(DeliveryNote).delete(
            deliveryNotes.map((row) => row.id),
          );
        }

        const leftoverLines = (order.items ?? [])
          .map((item) => ({
            warehouseId: item.warehouseId,
            productId: item.productId,
            uomId: item.uomId,
            quantity:
              Number(item.quantity) -
              (deliveredByItem.get(item.id) ?? 0),
          }))
          .filter((line) => line.quantity > 0);

        if (leftoverLines.length) {
          await this.stockService.releaseReservedStock(manager, {
            businessId: scopedBusinessId,
            lines: leftoverLines,
          });
        }

        await manager.getRepository(SaleOrder).delete(order.id);
      });
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_DELETED',
      description: `Sale order ${order.orderNumber} deleted`,
      metadata: { saleOrderId: order.id, ...cascaded },
    });

    return {
      message: 'Sale order deleted',
      data: { id: order.id, orderNumber: order.orderNumber },
    };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );

    if (order.orderStatus === OrderStatus.APPROVED) {
      throw new BadRequestException('Sale order is already approved');
    }

    if (order.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending sale orders can be approved',
      );
    }

    const loaded = await tenantDb.transaction(async (manager) => {
      order.orderStatus = OrderStatus.APPROVED;
      const approved = await manager.getRepository(SaleOrder).save(order);
      const approvedOrder = await manager.getRepository(SaleOrder).findOneOrFail({
        where: { id: approved.id },
        relations: this.orderRelations(),
      });

      await this.reserveSaleOrderStock(
        manager,
        scopedBusinessId,
        approvedOrder,
      );

      return approvedOrder;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_APPROVED',
      description: `Sale order ${loaded.orderNumber} approved and stock reserved`,
      metadata: { saleOrderId: loaded.id },
    });

    return { data: this.mapSaleOrder(loaded) };
  }

  async reject(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );

    if (order.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending sale orders can be rejected',
      );
    }

    order.orderStatus = OrderStatus.REJECTED;
    const rejected = await tenantDb.getRepository(SaleOrder).save(order);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_REJECTED',
      description: `Sale order ${rejected.orderNumber} rejected`,
      metadata: { saleOrderId: rejected.id },
    });

    return {
      message: 'Sale order rejected',
      data: { id: rejected.id, orderNumber: rejected.orderNumber },
    };
  }

  private sanitizeSaleOrderImportText(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value ?? '').trim();
    }
    return value.trim();
  }

  private normalizeSaleOrderImportHeaderKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, '');
  }

  private getSaleOrderImportRowValue(
    row: Record<string, unknown>,
    ...keys: string[]
  ): unknown {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(this.normalizeSaleOrderImportHeaderKey(key), value);
    }
    for (const key of keys) {
      const value = normalizedRow.get(
        this.normalizeSaleOrderImportHeaderKey(key),
      );
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private parseSaleOrderRowsFromFile(
    file: Express.Multer.File,
  ): SaleOrderImportRow[] {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const rows: SaleOrderImportRow[] = [];

    rawRows.forEach((row, index) => {
      const orderNumber = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(row, 'code', 'orderNumber', 'ordernumber'),
      );
      if (!orderNumber || orderNumber.toLowerCase() === 'code') {
        return;
      }

      const customerName = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(
          row,
          'customerName',
          'customer',
          'customername',
          'vendorName',
          'vendor',
          'vendorname',
        ),
      );
      const orderDate = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(row, 'orderDate', 'orderdate'),
      );

      rows.push({
        row: index + 2,
        orderNumber,
        customerName,
        orderDate,
      });
    });

    return rows;
  }

  private async findCustomerByName(
    tenantDb: DataSource,
    businessId: string,
    customerName: string,
  ): Promise<Party | null> {
    return tenantDb.getRepository(Party).findOne({
      where: {
        businessId,
        name: customerName,
        type: In([PartyType.CUSTOMER, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      select: ['id', 'name'],
    });
  }

  private async saveImportedSaleOrder(
    tenantDb: DataSource,
    params: {
      businessId: string;
      actorUserId: string;
      orderNumber: string;
      customerId: string;
      orderDate: Date;
    },
  ): Promise<SaleOrder> {
    const totals = this.computeOrderTotals([], {});
    const orderRepo = tenantDb.getRepository(SaleOrder);

    return orderRepo.save(
      orderRepo.create({
        orderNumber: params.orderNumber,
        customerId: params.customerId,
        businessId: params.businessId,
        orderStatus: OrderStatus.PENDING,
        orderTotal: totals.orderTotal,
        deliveryCost: 0,
        taxPercentage: totals.taxPercentage,
        taxAmount: totals.taxAmount,
        discountPercentage: totals.discountPercentage,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        notes: null,
        createdBy: params.actorUserId,
        orderDate: params.orderDate,
      }),
    );
  }

  private async notifySaleOrderImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Sale order import completed'
        : 'Sale order import failed';
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
        type: 'sale_order_import',
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

  private async processSaleOrderImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: SaleOrderImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const orderRepo = tenantDb.getRepository(SaleOrder);

    for (const row of rows) {
      try {
        if (!row.customerName) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Customer name is required',
          });
          continue;
        }

        if (!row.orderDate) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Order date is required',
          });
          continue;
        }

        const parsedDate = new Date(row.orderDate);
        if (Number.isNaN(parsedDate.getTime())) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Invalid order date',
          });
          continue;
        }

        const existing = await orderRepo.findOne({
          where: { orderNumber: row.orderNumber },
          select: ['id'],
        });
        if (existing) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Already exists',
          });
          continue;
        }

        const customer = await this.findCustomerByName(
          tenantDb,
          user.businessId,
          row.customerName,
        );
        if (!customer) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: `Customer not found: ${row.customerName}`,
          });
          continue;
        }

        const created = await this.saveImportedSaleOrder(tenantDb, {
          businessId: user.businessId,
          actorUserId: user.userId,
          orderNumber: row.orderNumber,
          customerId: customer.id,
          orderDate: parsedDate,
        });

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.orderNumber,
          status: 'success',
          metadata: {
            saleOrderId: created.id,
            orderNumber: created.orderNumber,
            customerId: customer.id,
            customerName: customer.name,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.orderNumber,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Sale order import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifySaleOrderImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importSaleOrders(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseSaleOrderRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No sale order rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'SALE_ORDER_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Sale order import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processSaleOrderImportJob(
      tenantDb,
      job.id,
      rows,
      user,
      tenantCode,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing failure',
      });
      const failedJob = this.tenantJobService.getJobById(
        job.id,
        tenantCode,
        user.userId,
      );

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_FAILED',
        description: `Sale order import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await this.notifySaleOrderImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Sale order import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }

  private parseSaleOrderImportNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseSaleOrderItemRowsFromFile(
    file: Express.Multer.File,
  ): SaleOrderItemImportRow[] {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const rows: SaleOrderItemImportRow[] = [];

    rawRows.forEach((row, index) => {
      const orderNumber = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(row, 'code', 'orderNumber', 'ordernumber'),
      );
      if (!orderNumber || orderNumber.toLowerCase() === 'code') {
        return;
      }

      const productTitle = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(
          row,
          'productTitle',
          'producttitle',
          'title',
          'productName',
          'productname',
        ),
      );
      const measurementUnit = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(
          row,
          'measurementUnit',
          'measurementunit',
          'uom',
        ),
      );
      const warehouseId = this.sanitizeSaleOrderImportText(
        this.getSaleOrderImportRowValue(row, 'warehouseId', 'warehouseid'),
      );
      const quantity =
        this.parseSaleOrderImportNumber(
          this.getSaleOrderImportRowValue(row, 'quantity', 'qty'),
        ) ?? 0;
      const purchaseUnitPrice =
        this.parseSaleOrderImportNumber(
          this.getSaleOrderImportRowValue(
            row,
            'purchaseUnitPrice',
            'purchaseunitprice',
          ),
        ) ?? 0;
      const saleUnitPrice =
        this.parseSaleOrderImportNumber(
          this.getSaleOrderImportRowValue(row, 'saleUnitPrice', 'saleunitprice'),
        ) ?? 0;
      const discountPercentage =
        this.parseSaleOrderImportNumber(
          this.getSaleOrderImportRowValue(
            row,
            'discountPercentage',
            'discountpercentage',
          ),
        ) ?? 0;

      rows.push({
        row: index + 2,
        orderNumber,
        productTitle,
        quantity,
        measurementUnit,
        purchaseUnitPrice,
        saleUnitPrice,
        discountPercentage,
        warehouseId,
      });
    });

    return rows;
  }

  private async findSaleOrderByNumberForBusiness(
    tenantDb: DataSource,
    businessId: string,
    orderNumber: string,
  ): Promise<SaleOrder | null> {
    return tenantDb.getRepository(SaleOrder).findOne({
      where: { orderNumber, businessId },
      select: [
        'id',
        'orderNumber',
        'orderStatus',
        'taxPercentage',
        'discountPercentage',
      ],
    });
  }

  private async findProductByNameForImport(
    tenantDb: DataSource,
    businessId: string,
    productTitle: string,
  ): Promise<Product | null> {
    return tenantDb.getRepository(Product).findOne({
      where: { name: productTitle, businessId, isDelete: false },
      select: ['id', 'name'],
    });
  }

  private async findUomByNameForImport(
    tenantDb: DataSource,
    businessId: string,
    measurementUnit: string,
  ): Promise<Uom | null> {
    return tenantDb.getRepository(Uom).findOne({
      where: { name: measurementUnit, businessId },
      select: ['id', 'name'],
    });
  }

  private resolveImportedSaleOrderLine(
    row: SaleOrderItemImportRow,
    productId: string,
    uomId: string,
    warehouseId: string,
    pricing: ProductPricing,
  ): ResolvedSaleOrderLine {
    const itemDto: CreateSaleOrderItemDto = {
      warehouseId,
      productId,
      uomId,
      quantity: row.quantity,
      purchaseUnitPrice: row.purchaseUnitPrice,
      saleUnitPrice: row.saleUnitPrice > 0 ? row.saleUnitPrice : undefined,
      discountPercentage: row.discountPercentage,
    };

    return this.resolveLineItem(itemDto, pricing);
  }

  private async recalculateOrderTotalsAfterItemImport(
    tenantDb: DataSource,
    orderId: string,
  ) {
    const order = await tenantDb.getRepository(SaleOrder).findOne({
      where: { id: orderId },
    });
    if (!order) {
      return;
    }

    const items = await tenantDb.getRepository(SaleOrderItem).find({
      where: { saleOrderId: orderId },
    });

    const resolvedLines: ResolvedSaleOrderLine[] = items.map((item) => ({
      warehouseId: item.warehouseId,
      productId: item.productId,
      uomId: item.uomId,
      productFlavourId: item.productFlavourId,
      quantity: item.quantity,
      purchaseUnitPrice: Number(item.purchaseUnitPrice),
      saleUnitPrice: Number(item.saleUnitPrice),
      discountPercentage: Number(item.discountPercentage),
      discountAmount: Number(item.discountAmount),
      totalAmount: Number(item.totalAmount),
    }));

    const totals = this.computeOrderTotals(resolvedLines, {
      taxPercentage: Number(order.taxPercentage),
      discountPercentage: Number(order.discountPercentage),
    });

    await tenantDb.getRepository(SaleOrder).update(orderId, {
      orderTotal: totals.orderTotal,
      taxPercentage: totals.taxPercentage,
      taxAmount: totals.taxAmount,
      discountPercentage: totals.discountPercentage,
      discountAmount: totals.discountAmount,
      totalAmount: totals.totalAmount,
    });
  }

  private async notifySaleOrderItemsImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Sale order items import completed'
        : 'Sale order items import failed';
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
        type: 'sale_order_items_import',
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

  private async processSaleOrderItemsImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: SaleOrderItemImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const ordersToRecalculate = new Set<string>();

    for (const row of rows) {
      const rowLabel = `${row.orderNumber} / ${row.productTitle}`;

      try {
        if (!row.productTitle) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Product title is required',
          });
          continue;
        }

        if (!row.measurementUnit) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Measurement unit is required',
          });
          continue;
        }

        if (!row.warehouseId) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Warehouse is required',
          });
          continue;
        }

        if (!row.quantity || row.quantity < 1) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Quantity must be at least 1',
          });
          continue;
        }

        const order = await this.findSaleOrderByNumberForBusiness(
          tenantDb,
          user.businessId,
          row.orderNumber,
        );
        if (!order) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Sale order not found: ${row.orderNumber}`,
          });
          continue;
        }

        if (order.orderStatus !== OrderStatus.PENDING) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Only pending sale orders can receive imported items',
          });
          continue;
        }

        const product = await this.findProductByNameForImport(
          tenantDb,
          user.businessId,
          row.productTitle,
        );
        if (!product) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Product not found: ${row.productTitle}`,
          });
          continue;
        }

        const uom = await this.findUomByNameForImport(
          tenantDb,
          user.businessId,
          row.measurementUnit,
        );
        if (!uom) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Measurement unit not found: ${row.measurementUnit}`,
          });
          continue;
        }

        const pricing = await tenantDb.getRepository(ProductPricing).findOne({
          where: { productId: product.id, uomId: uom.id },
        });
        if (!pricing) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Product pricing not found for ${row.productTitle} (${row.measurementUnit})`,
          });
          continue;
        }

        const resolvedLine = this.resolveImportedSaleOrderLine(
          row,
          product.id,
          uom.id,
          row.warehouseId,
          pricing,
        );

        await tenantDb.transaction(async (manager) => {
          await this.assertWarehouseForBusiness(
            manager,
            user.businessId,
            row.warehouseId,
          );
          await manager
            .getRepository(SaleOrderItem)
            .save(this.buildItemEntities(manager, order.id, [resolvedLine]));
        });

        ordersToRecalculate.add(order.id);

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: rowLabel,
          status: 'success',
          metadata: {
            saleOrderId: order.id,
            orderNumber: order.orderNumber,
            productId: product.id,
            productPricingId: pricing.id,
            uomId: uom.id,
            warehouseId: row.warehouseId,
            totalAmount: resolvedLine.totalAmount,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: rowLabel,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    for (const orderId of ordersToRecalculate) {
      await this.recalculateOrderTotalsAfterItemImport(tenantDb, orderId);
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Sale order items import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifySaleOrderItemsImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importSaleOrderItems(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseSaleOrderItemRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No sale order item rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'SALE_ORDER_ITEMS_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Sale order items import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processSaleOrderItemsImportJob(
      tenantDb,
      job.id,
      rows,
      user,
      tenantCode,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown processing failure',
      });
      const failedJob = this.tenantJobService.getJobById(
        job.id,
        tenantCode,
        user.userId,
      );

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'TENANT_JOB_FAILED',
        description: `Sale order items import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await this.notifySaleOrderItemsImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Sale order items import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
