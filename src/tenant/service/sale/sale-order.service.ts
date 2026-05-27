import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  IsNull,
} from 'typeorm';
import {
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
} from 'src/tenant-db/entities/sale-order.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
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
import { ActivityLogService } from '../activity-log.service';
import { StockService } from '../stock.service';

const ORDER_NUMBER_PREFIX = 'SO';

type ResolvedSaleOrderLine = {
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  quantity: number;
  purchaseUnitPrice: number;
  saleMarginAmount: number;
  saleMarginPercentage: number;
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

@Injectable()
export class SaleOrderService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
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

  private async assertWarehouseForBusiness(
    tenantDb: DataSource,
    businessId: string,
    warehouseId: string,
  ): Promise<Warehouse> {
    const warehouse = await tenantDb.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
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

  private resolveLineItem(
    item: CreateSaleOrderItemDto,
    pricing: ProductPricing,
  ): ResolvedSaleOrderLine {
    const purchaseUnitPrice = Number(
      item.purchaseUnitPrice ?? pricing.purchaseUnitPrice,
    );
    let saleMarginAmount =
      item.saleMarginAmount != null
        ? Number(item.saleMarginAmount)
        : Number(pricing.saleUnitMarginAmount);
    let saleMarginPercentage =
      item.saleMarginPercentage != null
        ? Number(item.saleMarginPercentage)
        : Number(pricing.saleUnitMarginPercentage);

    if (item.saleMarginAmount == null && item.saleMarginPercentage != null) {
      saleMarginAmount = this.roundAmount(
        (purchaseUnitPrice * saleMarginPercentage) / 100,
      );
    }

    if (item.saleMarginAmount != null && item.saleMarginPercentage == null) {
      saleMarginPercentage =
        purchaseUnitPrice > 0
          ? this.roundAmount((saleMarginAmount / purchaseUnitPrice) * 100)
          : 0;
    }

    const discountPercentage = item.discountPercentage ?? 0;
    const saleUnitPrice = this.roundAmount(
      purchaseUnitPrice + saleMarginAmount,
    );
    const lineSubtotal = saleUnitPrice * item.quantity;
    const discountAmount = this.roundAmount(
      (lineSubtotal * discountPercentage) / 100,
    );
    const totalAmount = this.roundAmount(lineSubtotal - discountAmount);

    return {
      productId: item.productId,
      uomId: item.uomId,
      productFlavourId: item.productFlavourId ?? null,
      quantity: item.quantity,
      purchaseUnitPrice: this.roundAmount(purchaseUnitPrice),
      saleMarginAmount: this.roundAmount(saleMarginAmount),
      saleMarginPercentage: this.roundAmount(saleMarginPercentage),
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
    },
  ): SaleOrderTotals {
    const orderTotal = this.roundAmount(
      lines.reduce((sum, line) => sum + line.totalAmount, 0),
    );
    const discountPercentage = this.roundAmount(options.discountPercentage ?? 0);
    const discountAmount = this.roundAmount(
      (orderTotal * discountPercentage) / 100,
    );
    const taxableBase = this.roundAmount(orderTotal - discountAmount);
    const taxPercentage = this.roundAmount(options.taxPercentage ?? 0);
    const taxAmount = this.roundAmount((taxableBase * taxPercentage) / 100);
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

  private async validateLineItems(
    manager: EntityManager,
    businessId: string,
    items: CreateSaleOrderItemDto[],
  ): Promise<Map<string, ProductPricing>> {
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
        productId: line.productId,
        productFlavourId: line.productFlavourId,
        uomId: line.uomId,
        purchaseUnitPrice: line.purchaseUnitPrice,
        saleMarginAmount: line.saleMarginAmount,
        saleMarginPercentage: line.saleMarginPercentage,
        quantity: line.quantity,
        discountPercentage: line.discountPercentage,
        discountAmount: line.discountAmount,
        totalAmount: line.totalAmount,
      }),
    );
  }

  private orderRelations() {
    return {
      warehouse: true,
      customer: true,
      createdByUser: true,
      items: {
        product: true,
        productFlavour: { flavour: true },
        uom: true,
      },
    } as const;
  }

  private mapSaleOrder(order: SaleOrder) {
    const items = (order.items ?? []).map((item) => ({
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
      uomId: item.uomId,
      uom: item.uom
        ? {
            id: item.uom.id,
            name: item.uom.name,
          }
        : null,
      purchaseUnitPrice: item.purchaseUnitPrice,
      saleMarginAmount: item.saleMarginAmount,
      saleMarginPercentage: item.saleMarginPercentage,
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
      warehouseId: order.warehouseId,
      warehouse: order.warehouse
        ? {
            id: order.warehouse.id,
            name: order.warehouse.name,
            code: order.warehouse.code,
          }
        : null,
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
      .leftJoinAndSelect('so.warehouse', 'warehouse')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.createdByUser', 'createdByUser')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
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
      warehouseId: order.warehouseId,
      lines: items
        .filter((item) => item.quantity > 0)
        .map((item) => ({
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
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
    await this.assertWarehouseForBusiness(
      tenantDb,
      params.businessId,
      params.dto.warehouseId,
    );
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
          warehouseId: params.dto.warehouseId,
          customerId: params.dto.customerId,
          businessId: params.businessId,
          deliveryCost: params.dto.deliveryCost,
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
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleMarginAmount: line.saleMarginAmount,
          saleMarginPercentage: line.saleMarginPercentage,
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
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleMarginAmount: line.saleMarginAmount,
          saleMarginPercentage: line.saleMarginPercentage,
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
    const created = await this.createOrderWithStatus(tenantDb, {
      businessId: scopedBusinessId,
      actorUserId,
      orderStatus: OrderStatus.APPROVED,
      dto,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_CREATED_APPROVED_AND_SALE_RESERVED',
      description: `Sale order ${created.orderNumber} created, approved, and stock reserved`,
      metadata: {
        saleOrderId: created.id,
        orderNumber: created.orderNumber,
      },
    });

    return {
      data: {
        saleOrder: this.mapSaleOrder(created),
        sale: null,
      },
      message: 'Sale order approved and stock reserved for delivery',
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
      warehouseId?: string;
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
      .leftJoinAndSelect('so.warehouse', 'warehouse')
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

    if (options.warehouseId) {
      qb.andWhere('so.warehouseId = :warehouseId', {
        warehouseId: options.warehouseId,
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
            .orWhere('warehouse.name ILIKE :search', { search })
            .orWhere('warehouse.code ILIKE :search', { search });
        }),
      );
    }

    const [orders, total] = await qb
      .orderBy('so.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

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

    if (dto.warehouseId !== undefined) {
      await this.assertWarehouseForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.warehouseId,
      );
      order.warehouseId = dto.warehouseId;
    }

    if (dto.customerId !== undefined) {
      await this.assertCustomerForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.customerId,
      );
      order.customerId = dto.customerId;
    }

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
          productId: item.productId,
          uomId: item.uomId,
          productFlavourId: item.productFlavourId ?? undefined,
          quantity: item.quantity,
          purchaseUnitPrice: Number(item.purchaseUnitPrice),
          saleMarginAmount: Number(item.saleMarginAmount),
          saleMarginPercentage: Number(item.saleMarginPercentage),
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
        warehouseId: order.warehouseId,
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
    this.assertPendingStatus(order);

    await tenantDb.getRepository(SaleOrder).remove(order);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_DELETED',
      description: `Sale order ${order.orderNumber} deleted`,
      metadata: { saleOrderId: order.id },
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
}
