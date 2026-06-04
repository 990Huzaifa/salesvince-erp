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
  PurchaseOrder,
  PurchaseOrderItem,
} from 'src/tenant-db/entities/purchase-order.entity';
import { Grn } from 'src/tenant-db/entities/grn.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import {
  Product,
  ProductFlavour,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { CreatePurchaseOrderDto } from '../../dto/purchase-order/create-purchase-order.dto';
import { CreatePurchaseOrderItemDto } from '../../dto/purchase-order/create-purchase-order-item.dto';
import { CreateSimplePurchaseOrderDto } from '../../dto/purchase-order/create-simple-purchase-order.dto';
import { CreateSimplePurchaseOrderItemDto } from '../../dto/purchase-order/create-simple-purchase-order-item.dto';
import { UpdatePurchaseOrderDto } from '../../dto/purchase-order/update-purchase-order.dto';
import { UpdatePurchaseOrderItemDto } from '../../dto/purchase-order/update-purchase-order-item.dto';
import { ActivityLogService } from '../activity-log.service';
import { GrnService } from './grn.service';

const ORDER_NUMBER_PREFIX = 'PO';

type ResolvedLineItem = {
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  quantity: number;
  purchaseUnitPrice: number;
  saleUnitMarginAmount: number;
  saleUnitMarginPercentage: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
};

type OrderTotals = {
  orderTotal: number;
  deliveryCost: number;
  taxPercentage: number;
  taxAmount: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
};

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly grnService: GrnService,
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
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .where('po.orderNumber LIKE :prefix', {
        prefix: `${ORDER_NUMBER_PREFIX}-%`,
      })
      .orderBy('po.orderNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.orderNumber.replace(
        `${ORDER_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${ORDER_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
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

  private async assertVendorForBusiness(
    tenantDb: DataSource,
    businessId: string,
    vendorId: string,
  ): Promise<Party> {
    const vendor = await tenantDb.getRepository(Party).findOne({
      where: { id: vendorId, businessId, deletedAt: IsNull() },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (vendor.type !== PartyType.VENDOR && vendor.type !== PartyType.BOTH) {
      throw new BadRequestException('Party must be a vendor');
    }

    return vendor;
  }

  private assertPendingStatus(order: PurchaseOrder): void {
    if (order.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending purchase orders can be modified or deleted',
      );
    }
  }

  private resolveLineItem(
    item: CreatePurchaseOrderItemDto,
    pricing: ProductPricing,
  ): ResolvedLineItem {
    const purchaseUnitPrice =
      item.purchaseUnitPrice ?? pricing.purchaseUnitPrice;
    const saleUnitMarginAmount =
      item.saleUnitMarginAmount ?? pricing.saleUnitMarginAmount;
    const saleUnitMarginPercentage =
      item.saleUnitMarginPercentage ?? pricing.saleUnitMarginPercentage;
    const lineSubtotal = purchaseUnitPrice * item.quantity;
    let discountPercentage = item.discountPercentage ?? 0;
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

    return {
      productId: item.productId,
      uomId: item.uomId,
      productFlavourId: item.productFlavourId,
      quantity: item.quantity,
      purchaseUnitPrice: this.roundAmount(purchaseUnitPrice),
      saleUnitMarginAmount: this.roundAmount(saleUnitMarginAmount),
      saleUnitMarginPercentage: this.roundAmount(saleUnitMarginPercentage),
      discountPercentage: this.roundAmount(discountPercentage),
      discountAmount,
      totalAmount,
    };
  }

  private resolveLineItemFromPricing(
    item: CreateSimplePurchaseOrderItemDto,
    pricing: ProductPricing,
  ): ResolvedLineItem {
    return this.resolveLineItem(
      {
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId,
        quantity: item.quantity,
      },
      pricing,
    );
  }

  private computeOrderTotals(
    lines: ResolvedLineItem[],
    options: {
      deliveryCost?: number;
      taxPercentage?: number;
      discountPercentage?: number;
      discountAmount?: number;
      taxAmount?: number;
    },
  ): OrderTotals {
    const orderTotal = this.roundAmount(
      lines.reduce((sum, line) => sum + line.totalAmount, 0),
    );
    const deliveryCost = this.roundAmount(options.deliveryCost ?? 0);
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
    const totalAmount = this.roundAmount(
      taxableBase + taxAmount + deliveryCost,
    );

    return {
      orderTotal,
      deliveryCost,
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
    items: CreatePurchaseOrderItemDto[],
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
    items: CreatePurchaseOrderItemDto[],
    pricingByKey: Map<string, ProductPricing>,
  ): ResolvedLineItem[] {
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
    purchaseOrderId: string,
    lines: ResolvedLineItem[],
  ): PurchaseOrderItem[] {
    const itemRepo = manager.getRepository(PurchaseOrderItem);
    return lines.map((line) =>
      itemRepo.create({
        purchaseOrderId,
        productId: line.productId,
        productFlavourId: line.productFlavourId,
        uomId: line.uomId,
        purchaseUnitPrice: line.purchaseUnitPrice,
        saleUnitMarginAmount: line.saleUnitMarginAmount,
        saleUnitMarginPercentage: line.saleUnitMarginPercentage,
        quantity: line.quantity,
        discountPercentage: line.discountPercentage,
        discountAmount: line.discountAmount,
        totalAmount: line.totalAmount,
      }),
    );
  }

  private mapPurchaseOrder(order: PurchaseOrder) {
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
      saleUnitMarginAmount: item.saleUnitMarginAmount,
      saleUnitMarginPercentage: item.saleUnitMarginPercentage,
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
      vendorId: order.vendorId,
      vendor: order.vendor
        ? {
            id: order.vendor.id,
            code: order.vendor.code,
            name: order.vendor.name,
            type: order.vendor.type,
          }
        : null,
      orderStatus: order.orderStatus,
      orderTotal: order.orderTotal,
      deliveryCost: order.deliveryCost,
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

  private mapPurchaseWorkflowGrn(grn: Grn) {
    return {
      id: grn.id,
      grnNumber: grn.grnNumber,
      grnDate: grn.grnDate,
      status: grn.status,
      totalTaxAmount: grn.totalTaxAmount,
      totalDiscountAmount: grn.totalDiscountAmount,
      totalAmount: grn.totalAmount,
    };
  }

  private mapPurchaseWorkflowInvoice(invoice: PurchaseInvoice | null) {
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

  private orderRelations() {
    return {
      warehouse: true,
      vendor: true,
      createdByUser: true,
      items: {
        product: true,
        productFlavour: { flavour: true },
        uom: true,
      },
    } as const;
  }

  private async findOrderForBusiness(
    tenantDb: DataSource,
    businessId: string,
    orderId: string,
  ): Promise<PurchaseOrder> {
    const order = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .innerJoin('po.warehouse', 'warehouse')
      .leftJoinAndSelect('po.warehouse', 'warehouseSelect')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('po.createdByUser', 'createdByUser')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('po.id = :orderId', { orderId })
      .andWhere('warehouse.businessId = :businessId', { businessId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    return order;
  }

  private async syncOrderItems(
    manager: EntityManager,
    businessId: string,
    orderId: string,
    items: UpdatePurchaseOrderItemDto[],
    existingItems: PurchaseOrderItem[],
  ): Promise<void> {
    const pricingByKey = await this.validateLineItems(manager, businessId, items);
    const resolvedLines = this.buildResolvedLines(items, pricingByKey);

    const itemRepo = manager.getRepository(PurchaseOrderItem);
    const existingById = new Map(existingItems.map((row) => [row.id, row]));
    const keptItemIds = new Set<string>();

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const line = resolvedLines[index];

      if (item.id) {
        const existing = existingById.get(item.id);
        if (!existing || existing.purchaseOrderId !== orderId) {
          throw new NotFoundException(`Purchase order item ${item.id} not found`);
        }
        keptItemIds.add(item.id);
        await itemRepo.update(existing.id, {
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitMarginAmount: line.saleUnitMarginAmount,
          saleUnitMarginPercentage: line.saleUnitMarginPercentage,
          quantity: line.quantity,
          discountPercentage: line.discountPercentage,
          discountAmount: line.discountAmount,
          totalAmount: line.totalAmount,
        });
        continue;
      }

      await itemRepo.save(
        itemRepo.create({
          purchaseOrderId: orderId,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitMarginAmount: line.saleUnitMarginAmount,
          saleUnitMarginPercentage: line.saleUnitMarginPercentage,
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
        purchaseOrderId: orderId,
      });
    }
  }

  private async saveOrderInTransaction(
    tenantDb: DataSource,
    params: {
      businessId: string;
      actorUserId: string;
      orderStatus: OrderStatus;
      header: {
        orderNumber: string;
        warehouseId: string;
        vendorId: string;
        orderDate: Date;
        notes: string | null;
        totals: OrderTotals;
      };
      items: CreatePurchaseOrderItemDto[];
    },
  ): Promise<PurchaseOrder> {
    return tenantDb.transaction(async (manager) => {
      const pricingByKey = await this.validateLineItems(
        manager,
        params.businessId,
        params.items,
      );
      const resolvedLines = this.buildResolvedLines(params.items, pricingByKey);

      const order = await manager.getRepository(PurchaseOrder).save(
        manager.getRepository(PurchaseOrder).create({
          orderNumber: params.header.orderNumber,
          warehouseId: params.header.warehouseId,
          vendorId: params.header.vendorId,
          businessId: params.businessId,
          orderStatus: params.orderStatus,
          orderTotal: params.header.totals.orderTotal,
          deliveryCost: params.header.totals.deliveryCost,
          taxPercentage: params.header.totals.taxPercentage,
          taxAmount: params.header.totals.taxAmount,
          discountPercentage: params.header.totals.discountPercentage,
          discountAmount: params.header.totals.discountAmount,
          totalAmount: params.header.totals.totalAmount,
          notes: params.header.notes,
          createdBy: params.actorUserId,
          orderDate: params.header.orderDate,
        }),
      );

      await manager
        .getRepository(PurchaseOrderItem)
        .save(this.buildItemEntities(manager, order.id, resolvedLines));

      return manager.getRepository(PurchaseOrder).findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });
    });
  }

  private async resolveOrderNumber(
    tenantDb: DataSource,
    orderNumber?: string,
  ): Promise<string> {
    const resolved =
      orderNumber?.trim() || (await this.generateOrderNumber(tenantDb));

    const existing = await tenantDb
      .getRepository(PurchaseOrder)
      .findOne({ where: { orderNumber: resolved } });

    if (existing) {
      throw new ConflictException(
        'Purchase order with this order number already exists',
      );
    }

    return resolved;
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePurchaseOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    await this.assertWarehouseForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.warehouseId,
    );
    await this.assertVendorForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.vendorId,
    );

    const orderNumber = await this.resolveOrderNumber(tenantDb, dto.orderNumber);
    const pricingByKey = await this.validateLineItems(
      tenantDb.manager,
      scopedBusinessId,
      dto.items,
    );
    const resolvedLines = this.buildResolvedLines(dto.items, pricingByKey);
    const totals = this.computeOrderTotals(resolvedLines, {
      deliveryCost: dto.deliveryCost,
      taxPercentage: dto.taxPercentage,
      discountPercentage: dto.discountPercentage,
      discountAmount: dto.discountAmount,
      taxAmount: dto.taxAmount,
    });

    const created = await this.saveOrderInTransaction(tenantDb, {
      businessId: scopedBusinessId,
      actorUserId,
      orderStatus: OrderStatus.PENDING,
      header: {
        orderNumber,
        warehouseId: dto.warehouseId,
        vendorId: dto.vendorId,
        orderDate: new Date(dto.orderDate),
        notes: dto.notes?.trim() || null,
        totals,
      },
      items: dto.items,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_CREATED',
      description: `Purchase order ${created.orderNumber} created`,
      metadata: {
        purchaseOrderId: created.id,
        orderNumber: created.orderNumber,
        orderStatus: created.orderStatus,
      },
    });

    return { data: this.mapPurchaseOrder(created) };
  }

  async createSimple(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSimplePurchaseOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    await this.assertWarehouseForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.warehouseId,
    );
    await this.assertVendorForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.vendorId,
    );

    const fullItems: CreatePurchaseOrderItemDto[] = dto.items.map((item) => ({
      productId: item.productId,
      uomId: item.uomId,
      productFlavourId: item.productFlavourId,
      quantity: item.quantity,
    }));

    const orderNumber = await this.resolveOrderNumber(tenantDb);
    const pricingByKey = await this.validateLineItems(
      tenantDb.manager,
      scopedBusinessId,
      fullItems,
    );
    const resolvedLines = fullItems.map((item) => {
      const pricing = pricingByKey.get(`${item.productId}:${item.uomId}`);
      if (!pricing) {
        throw new BadRequestException(
          `Product ${item.productId} has no pricing for UOM ${item.uomId}`,
        );
      }
      return this.resolveLineItemFromPricing(
        {
          productId: item.productId,
          uomId: item.uomId,
          productFlavourId: item.productFlavourId,
          quantity: item.quantity,
        },
        pricing,
      );
    });
    const totals = this.computeOrderTotals(resolvedLines, {});

    const created = await this.saveOrderInTransaction(tenantDb, {
      businessId: scopedBusinessId,
      actorUserId,
      orderStatus: OrderStatus.PENDING,
      header: {
        orderNumber,
        warehouseId: dto.warehouseId,
        vendorId: dto.vendorId,
        orderDate: new Date(dto.orderDate),
        notes: dto.notes?.trim() || null,
        totals,
      },
      items: fullItems,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_CREATED_SIMPLE',
      description: `Purchase order ${created.orderNumber} created (simple)`,
      metadata: {
        purchaseOrderId: created.id,
        orderNumber: created.orderNumber,
      },
    });

    return { data: this.mapPurchaseOrder(created) };
  }

  async createAndApproved(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePurchaseOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    await this.assertWarehouseForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.warehouseId,
    );
    await this.assertVendorForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.vendorId,
    );

    const orderNumber = await this.resolveOrderNumber(tenantDb, dto.orderNumber);
    const pricingByKey = await this.validateLineItems(
      tenantDb.manager,
      scopedBusinessId,
      dto.items,
    );
    const resolvedLines = this.buildResolvedLines(dto.items, pricingByKey);
    const totals = this.computeOrderTotals(resolvedLines, {
      deliveryCost: dto.deliveryCost,
      taxPercentage: dto.taxPercentage,
      discountPercentage: dto.discountPercentage,
      discountAmount: dto.discountAmount,
      taxAmount: dto.taxAmount,
    });

    const created = await this.saveOrderInTransaction(tenantDb, {
      businessId: scopedBusinessId,
      actorUserId,
      orderStatus: OrderStatus.APPROVED,
      header: {
        orderNumber,
        warehouseId: dto.warehouseId,
        vendorId: dto.vendorId,
        orderDate: new Date(dto.orderDate),
        notes: dto.notes?.trim() || null,
        totals,
      },
      items: dto.items,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_CREATED_AND_APPROVED',
      description: `Purchase order ${created.orderNumber} created and approved`,
      metadata: {
        purchaseOrderId: created.id,
        orderNumber: created.orderNumber,
      },
    });

    return { data: this.mapPurchaseOrder(created) };
  }

  async createApproveAndPurchase(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePurchaseOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    await this.assertWarehouseForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.warehouseId,
    );
    const vendor = await this.assertVendorForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.vendorId,
    );

    if (!vendor.payableAccountId) {
      throw new BadRequestException(
        'Vendor payable account is required before approving GRN',
      );
    }

    const orderNumber = await this.resolveOrderNumber(tenantDb, dto.orderNumber);
    const pricingByKey = await this.validateLineItems(
      tenantDb.manager,
      scopedBusinessId,
      dto.items,
    );
    const resolvedLines = this.buildResolvedLines(dto.items, pricingByKey);
    const totals = this.computeOrderTotals(resolvedLines, {
      deliveryCost: dto.deliveryCost,
      taxPercentage: dto.taxPercentage,
      discountPercentage: dto.discountPercentage,
      discountAmount: dto.discountAmount,
      taxAmount: dto.taxAmount,
    });

    const created = await tenantDb.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const order = await orderRepo.save(
        orderRepo.create({
          orderNumber,
          warehouseId: dto.warehouseId,
          vendorId: dto.vendorId,
          businessId: scopedBusinessId,
          orderStatus: OrderStatus.APPROVED,
          orderTotal: totals.orderTotal,
          deliveryCost: totals.deliveryCost,
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
        .getRepository(PurchaseOrderItem)
        .save(this.buildItemEntities(manager, order.id, resolvedLines));

      const loadedOrder = await orderRepo.findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });
      const grn = await this.grnService.createApprovedFromOrder(manager, {
        businessId: scopedBusinessId,
        order: loadedOrder,
        grnDate: new Date(dto.orderDate),
        deliveryCost: dto.deliveryCost,
        taxPercentage: dto.taxPercentage,
        discountPercentage: dto.discountPercentage,
        totalDiscountAmount: dto.totalDiscountAmount,
        totalTaxAmount: dto.totalTaxAmount,
        notes: dto.notes,
        actorUserId,
      });
      const purchaseInvoice = await manager
        .getRepository(PurchaseInvoice)
        .findOne({
          where: { grnId: grn.id, deletedAt: IsNull() },
        });

      return { order: loadedOrder, grn, purchaseInvoice };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_CREATED_APPROVED_AND_PURCHASED',
      description: `Purchase order ${created.order.orderNumber} created, approved, and purchased`,
      metadata: {
        purchaseOrderId: created.order.id,
        orderNumber: created.order.orderNumber,
        grnId: created.grn.id,
        grnNumber: created.grn.grnNumber,
        purchaseInvoiceId: created.purchaseInvoice?.id ?? null,
        invoiceNumber: created.purchaseInvoice?.invoiceNumber ?? null,
      },
    });

    return {
      data: {
        purchaseOrder: this.mapPurchaseOrder(created.order),
        grn: this.mapPurchaseWorkflowGrn(created.grn),
        purchaseInvoice: this.mapPurchaseWorkflowInvoice(
          created.purchaseInvoice,
        ),
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
      vendorId?: string;
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
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .innerJoinAndSelect('po.warehouse', 'warehouse')
      .innerJoinAndSelect('po.vendor', 'vendor')
      .leftJoinAndSelect('po.createdByUser', 'createdByUser')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('warehouse.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.vendorId) {
      qb.andWhere('po.vendorId = :vendorId', { vendorId: options.vendorId });
    }

    if (options.warehouseId) {
      qb.andWhere('po.warehouseId = :warehouseId', {
        warehouseId: options.warehouseId,
      });
    }

    if (options.orderStatus) {
      qb.andWhere('po.orderStatus = :orderStatus', {
        orderStatus: options.orderStatus,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('po.orderNumber ILIKE :search', { search })
            .orWhere('vendor.name ILIKE :search', { search })
            .orWhere('vendor.code ILIKE :search', { search })
            .orWhere('warehouse.name ILIKE :search', { search })
            .orWhere('warehouse.code ILIKE :search', { search });
        }),
      );
    }

    const [orders, total] = await qb
      .orderBy('po.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_LISTED',
      description: 'Purchase orders listed',
      metadata: { total, page, limit },
    });

    return {
      data: orders.map((order) => this.mapPurchaseOrder(order)),
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
      action: 'PURCHASE_ORDER_VIEWED',
      description: `Purchase order ${order.orderNumber} viewed`,
      metadata: { purchaseOrderId: order.id },
    });

    return { data: this.mapPurchaseOrder(order) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    dto: UpdatePurchaseOrderDto,
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

    if (dto.vendorId !== undefined) {
      await this.assertVendorForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.vendorId,
      );
      order.vendorId = dto.vendorId;
    }

    if (dto.orderNumber !== undefined) {
      const nextNumber = dto.orderNumber.trim();
      if (!nextNumber) {
        throw new BadRequestException('Order number cannot be empty');
      }
      if (nextNumber !== order.orderNumber) {
        const taken = await tenantDb
          .getRepository(PurchaseOrder)
          .findOne({ where: { orderNumber: nextNumber } });
        if (taken) {
          throw new ConflictException(
            'Purchase order with this order number already exists',
          );
        }
        order.orderNumber = nextNumber;
      }
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

      const itemsForTotals = dto.items ?? existingItems.map((item) => ({
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId ?? undefined,
        quantity: item.quantity,
        purchaseUnitPrice: item.purchaseUnitPrice,
        saleUnitMarginAmount: item.saleUnitMarginAmount,
        saleUnitMarginPercentage: item.saleUnitMarginPercentage,
        discountPercentage: item.discountPercentage,
      }));

      const pricingByKey = await this.validateLineItems(
        manager,
        scopedBusinessId,
        itemsForTotals,
      );
      const resolvedLines = this.buildResolvedLines(itemsForTotals, pricingByKey);
      const totals = this.computeOrderTotals(resolvedLines, {
        deliveryCost: dto.deliveryCost ?? order.deliveryCost,
        taxPercentage: dto.taxPercentage ?? order.taxPercentage,
        discountPercentage:
          dto.discountPercentage ?? order.discountPercentage,
        discountAmount: dto.discountAmount ?? order.discountAmount,
        taxAmount: dto.taxAmount ?? order.taxAmount,
      });

      await manager.getRepository(PurchaseOrder).update(order.id, {
        orderNumber: order.orderNumber,
        warehouseId: order.warehouseId,
        vendorId: order.vendorId,
        orderDate: order.orderDate,
        notes: order.notes,
        orderTotal: totals.orderTotal,
        deliveryCost: totals.deliveryCost,
        taxPercentage: totals.taxPercentage,
        taxAmount: totals.taxAmount,
        discountPercentage: totals.discountPercentage,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
      });

      return manager.getRepository(PurchaseOrder).findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_UPDATED',
      description: `Purchase order ${updated.orderNumber} updated`,
      metadata: { purchaseOrderId: updated.id },
    });

    return { data: this.mapPurchaseOrder(updated) };
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

    await tenantDb.getRepository(PurchaseOrder).remove(order);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_DELETED',
      description: `Purchase order ${order.orderNumber} deleted`,
      metadata: { purchaseOrderId: order.id },
    });

    return {
      message: 'Purchase order deleted',
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
      throw new BadRequestException('Purchase order is already approved');
    }

    if (order.orderStatus !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Only pending purchase orders can be approved',
      );
    }

    order.orderStatus = OrderStatus.APPROVED;
    const approved = await tenantDb.getRepository(PurchaseOrder).save(order);

    const loaded = await tenantDb.getRepository(PurchaseOrder).findOneOrFail({
      where: { id: approved.id },
      relations: this.orderRelations(),
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_APPROVED',
      description: `Purchase order ${loaded.orderNumber} approved`,
      metadata: { purchaseOrderId: loaded.id },
    });

    return { data: this.mapPurchaseOrder(loaded) };
  }
}
