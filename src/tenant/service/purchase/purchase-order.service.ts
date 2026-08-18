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
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { PurchaseReturn } from 'src/tenant-db/entities/purchase-return.entity';
import { PurchaseReturnVoucher } from 'src/tenant-db/entities/purchase-return-voucher.entity';
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
import { EditApprovedPurchaseOrderDto } from '../../dto/purchase-order/edit-approved-purchase-order.dto';
import { EditApprovedPurchaseOrderItemDto } from '../../dto/purchase-order/edit-approved-purchase-order-item.dto';
import * as XLSX from 'xlsx';
import { ActivityLogService } from '../activity-log.service';
import {
  ListAnalyticsModule,
  ListAnalyticsService,
} from '../list-analytics.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import { GrnService } from './grn.service';
import { PurchaseReturnService } from './purchase-return.service';
import { PurchaseReturnVoucherService } from '../vouchers/purchase-return-voucher.service';

const ORDER_NUMBER_PREFIX = 'PO';

type ResolvedLineItem = {
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

type OrderTotals = {
  orderTotal: number;
  deliveryCost: number;
  taxPercentage: number;
  taxAmount: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
};

type PurchaseOrderImportRow = {
  row: number;
  orderNumber: string;
  vendorName: string;
  orderDate: string;
  warehouseId: string;
};

type PurchaseOrderItemImportRow = {
  row: number;
  orderNumber: string;
  productTitle: string;
  quantity: number;
  measurementUnit: string;
  unitPrice: number;
  discount: number;
  discountInPercentage: boolean;
  tax: number;
  totalPrice: number;
};

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly grnService: GrnService,
    private readonly purchaseReturnService: PurchaseReturnService,
    private readonly purchaseReturnVoucherService: PurchaseReturnVoucherService,
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

  private assertApprovedStatus(order: PurchaseOrder): void {
    if (order.orderStatus !== OrderStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved purchase orders can be edited with this endpoint',
      );
    }
  }

  private async assertNoPurchaseReturnsOnOrder(
    tenantDb: DataSource,
    businessId: string,
    orderId: string,
  ): Promise<void> {
    const count = await tenantDb
      .getRepository(PurchaseReturn)
      .createQueryBuilder('purchaseReturn')
      .innerJoin('purchaseReturn.purchaseInvoice', 'invoice')
      .innerJoin('invoice.grn', 'grn')
      .where('grn.purchaseOrderId = :orderId', { orderId })
      .andWhere('invoice.businessId = :businessId', { businessId })
      .getCount();

    if (count > 0) {
      throw new BadRequestException(
        'Cannot edit purchase order with existing purchase returns',
      );
    }
  }

  private async syncApprovedOrderItems(
    manager: EntityManager,
    orderId: string,
    items: EditApprovedPurchaseOrderItemDto[],
    existingItems: PurchaseOrderItem[],
  ): Promise<void> {
    if (items.length !== existingItems.length) {
      throw new BadRequestException(
        'All purchase order line items must be included',
      );
    }

    const existingById = new Map(existingItems.map((row) => [row.id, row]));
    const payloadIds = new Set(items.map((item) => item.id));

    for (const existing of existingItems) {
      if (!payloadIds.has(existing.id)) {
        throw new BadRequestException(
          'All purchase order line items must be included',
        );
      }
    }

    const itemRepo = manager.getRepository(PurchaseOrderItem);

    for (const item of items) {
      const existing = existingById.get(item.id);
      if (!existing || existing.purchaseOrderId !== orderId) {
        throw new NotFoundException(`Purchase order item ${item.id} not found`);
      }

      const lineSubtotal = item.purchaseUnitPrice * item.quantity;
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
        quantity: item.quantity,
        purchaseUnitPrice: this.roundAmount(item.purchaseUnitPrice),
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
    item: CreatePurchaseOrderItemDto,
    pricing: ProductPricing,
  ): ResolvedLineItem {
    const purchaseUnitPrice =
      item.purchaseUnitPrice ?? pricing.purchaseUnitPrice;
    const saleUnitPrice = this.roundAmount(
      item.saleUnitPrice != null
        ? Number(item.saleUnitPrice)
        : this.defaultSaleUnitPriceFromPricing(purchaseUnitPrice, pricing),
    );
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
      saleUnitPrice,
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
        saleUnitPrice: line.saleUnitPrice,
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
          purchaseOrderId: orderId,
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

    const [[orders, total], analytics] = await Promise.all([
      qb
        .orderBy('po.orderDate', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount(),
      this.listAnalyticsService.getDocumentAnalytics(
        tenantDb,
        scopedBusinessId,
        ListAnalyticsModule.PURCHASE_ORDER,
      ),
    ]);

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
        saleUnitPrice: item.saleUnitPrice,
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

  async editApproved(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    dto: EditApprovedPurchaseOrderDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );
    this.assertApprovedStatus(order);
    await this.assertNoPurchaseReturnsOnOrder(
      tenantDb,
      scopedBusinessId,
      order.id,
    );

    const existingItems = [...(order.items ?? [])];
    if (!existingItems.length) {
      throw new BadRequestException('Purchase order has no line items');
    }

    const hasApprovedGrn = await tenantDb.getRepository(Grn).exists({
      where: {
        purchaseOrderId: order.id,
        businessId: scopedBusinessId,
        status: GrnStatus.APPROVED,
        deletedAt: IsNull(),
      },
    });

    const vendor = order.vendor;
    if (!vendor) {
      throw new NotFoundException('Vendor not found on purchase order');
    }
    if (hasApprovedGrn && !vendor.payableAccountId) {
      throw new BadRequestException(
        'Vendor payable account is required before editing purchase order with approved GRNs',
      );
    }

    const updated = await tenantDb.transaction(async (manager) => {
      await this.syncApprovedOrderItems(
        manager,
        order.id,
        dto.items,
        existingItems,
      );

      const syncedItems = await manager.getRepository(PurchaseOrderItem).find({
        where: { purchaseOrderId: order.id },
      });

      const resolvedLines: ResolvedLineItem[] = syncedItems.map((item) => ({
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
        deliveryCost: dto.deliveryCost ?? order.deliveryCost,
        taxPercentage: dto.taxPercentage ?? order.taxPercentage,
        discountPercentage:
          dto.discountPercentage ?? order.discountPercentage,
        discountAmount: dto.discountAmount ?? order.discountAmount,
        taxAmount: dto.taxAmount ?? order.taxAmount,
      });

      const orderDate = new Date(dto.orderDate);

      await manager.getRepository(PurchaseOrder).update(order.id, {
        orderDate,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : order.notes,
        orderTotal: totals.orderTotal,
        deliveryCost: totals.deliveryCost,
        taxPercentage: totals.taxPercentage,
        taxAmount: totals.taxAmount,
        discountPercentage: totals.discountPercentage,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
      });

      // Reload header + lines outside the identity map (relations stay stale after .update()).
      const orderForCascade = await manager
        .getRepository(PurchaseOrder)
        .findOneOrFail({ where: { id: order.id } });
      orderForCascade.items = await manager.getRepository(PurchaseOrderItem).find({
        where: { purchaseOrderId: order.id },
      });
      orderForCascade.orderDate = orderDate;
      orderForCascade.orderTotal = totals.orderTotal;
      orderForCascade.deliveryCost = totals.deliveryCost;
      orderForCascade.taxPercentage = totals.taxPercentage;
      orderForCascade.taxAmount = totals.taxAmount;
      orderForCascade.discountPercentage = totals.discountPercentage;
      orderForCascade.discountAmount = totals.discountAmount;
      orderForCascade.totalAmount = totals.totalAmount;

      await this.grnService.cascadeFromPurchaseOrder(
        manager,
        scopedBusinessId,
        orderForCascade,
        vendor,
      );

      orderForCascade.items = await manager
        .getRepository(PurchaseOrderItem)
        .find({ where: { purchaseOrderId: order.id } });

      return manager.getRepository(PurchaseOrder).findOneOrFail({
        where: { id: order.id },
        relations: this.orderRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_EDITED_APPROVED',
      description: `Approved purchase order ${updated.orderNumber} edited`,
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

    const cascaded: {
      grnIds: string[];
      invoiceIds: string[];
      purchaseReturnIds: string[];
      purchaseReturnVoucherIds: string[];
    } = {
      grnIds: [],
      invoiceIds: [],
      purchaseReturnIds: [],
      purchaseReturnVoucherIds: [],
    };

    if (
      order.orderStatus === OrderStatus.PENDING ||
      order.orderStatus === OrderStatus.REJECTED
    ) {
      await tenantDb.getRepository(PurchaseOrder).remove(order);
    } else {
      await tenantDb.transaction(async (manager) => {
        const grns = await manager.getRepository(Grn).find({
          where: { purchaseOrderId: order.id },
          relations: { items: true, vendor: true },
        });
        const invoices = await manager.getRepository(PurchaseInvoice).find({
          where: { purchaseOrderId: order.id },
        });
        const invoiceIds = invoices.map((invoice) => invoice.id);
        const purchaseReturns = invoiceIds.length
          ? await manager.getRepository(PurchaseReturn).find({
              where: { purchaseInvoiceId: In(invoiceIds) },
              relations: { purchaseReturnItems: true },
            })
          : [];
        const returnVouchers = invoiceIds.length
          ? await manager.getRepository(PurchaseReturnVoucher).find({
              where: { invoiceId: In(invoiceIds) },
            })
          : [];

        cascaded.grnIds = grns.map((row) => row.id);
        cascaded.invoiceIds = invoiceIds;
        cascaded.purchaseReturnIds = purchaseReturns.map((row) => row.id);
        cascaded.purchaseReturnVoucherIds = returnVouchers.map((row) => row.id);

        for (const voucher of returnVouchers) {
          await this.purchaseReturnVoucherService.deleteInManager(
            manager,
            scopedBusinessId,
            voucher.id,
          );
        }

        for (const purchaseReturn of purchaseReturns) {
          await this.purchaseReturnService.removeForOrderCascade(
            manager,
            scopedBusinessId,
            purchaseReturn,
          );
        }

        for (const grn of grns) {
          await this.grnService.reverseApprovedEffects(
            manager,
            scopedBusinessId,
            grn,
          );
        }

        if (invoiceIds.length) {
          await manager.getRepository(PurchaseInvoice).delete(invoiceIds);
        }
        if (grns.length) {
          await manager.getRepository(Grn).delete(grns.map((row) => row.id));
        }

        await manager.getRepository(PurchaseOrder).delete(order.id);
      });
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_DELETED',
      description: `Purchase order ${order.orderNumber} deleted`,
      metadata: { purchaseOrderId: order.id, ...cascaded },
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
        'Only pending purchase orders can be rejected',
      );
    }

    order.orderStatus = OrderStatus.REJECTED;
    const rejected = await tenantDb.getRepository(PurchaseOrder).save(order);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_REJECTED',
      description: `Purchase order ${rejected.orderNumber} rejected`,
      metadata: { purchaseOrderId: rejected.id },
    });

    return {
      message: 'Purchase order rejected',
      data: { id: rejected.id, orderNumber: rejected.orderNumber },
    };
  }

  private sanitizePurchaseOrderImportText(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value ?? '').trim();
    }
    return value.trim();
  }

  private normalizePurchaseOrderImportHeaderKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, '');
  }

  private getPurchaseOrderImportRowValue(
    row: Record<string, unknown>,
    ...keys: string[]
  ): unknown {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(this.normalizePurchaseOrderImportHeaderKey(key), value);
    }
    for (const key of keys) {
      const value = normalizedRow.get(
        this.normalizePurchaseOrderImportHeaderKey(key),
      );
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private parsePurchaseOrderRowsFromFile(
    file: Express.Multer.File,
  ): PurchaseOrderImportRow[] {
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

    const rows: PurchaseOrderImportRow[] = [];

    rawRows.forEach((row, index) => {
      const orderNumber = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(row, 'code', 'orderNumber', 'ordernumber'),
      );
      if (!orderNumber || orderNumber.toLowerCase() === 'code') {
        return;
      }

      const vendorName = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(row, 'vendorName', 'vendor', 'vendorname'),
      );
      const orderDate = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(row, 'orderDate', 'orderdate'),
      );
      const warehouseId = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(row, 'warehouseId', 'warehouseid'),
      );

      rows.push({
        row: index + 2,
        orderNumber,
        vendorName,
        orderDate,
        warehouseId,
      });
    });

    return rows;
  }

  private async findVendorByName(
    tenantDb: DataSource,
    businessId: string,
    vendorName: string,
  ): Promise<Party | null> {
    return tenantDb.getRepository(Party).findOne({
      where: {
        businessId,
        name: vendorName,
        type: In([PartyType.VENDOR, PartyType.BOTH]),
        deletedAt: IsNull(),
      },
      select: ['id', 'name'],
    });
  }

  private async saveImportedPurchaseOrder(
    tenantDb: DataSource,
    params: {
      businessId: string;
      actorUserId: string;
      orderNumber: string;
      warehouseId: string;
      vendorId: string;
      orderDate: Date;
    },
  ): Promise<PurchaseOrder> {
    const totals = this.computeOrderTotals([], {});
    const orderRepo = tenantDb.getRepository(PurchaseOrder);

    return orderRepo.save(
      orderRepo.create({
        orderNumber: params.orderNumber,
        warehouseId: params.warehouseId,
        vendorId: params.vendorId,
        businessId: params.businessId,
        orderStatus: OrderStatus.PENDING,
        orderTotal: totals.orderTotal,
        deliveryCost: totals.deliveryCost,
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

  private async notifyPurchaseOrderImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Purchase order import completed'
        : 'Purchase order import failed';
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
        type: 'purchase_order_import',
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

  private async processPurchaseOrderImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: PurchaseOrderImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const orderRepo = tenantDb.getRepository(PurchaseOrder);
    const warehouseRepo = tenantDb.getRepository(Warehouse);

    for (const row of rows) {
      try {
        if (!row.vendorName) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Vendor name is required',
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

        if (!row.warehouseId) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Warehouse ID is required',
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

        const vendor = await this.findVendorByName(
          tenantDb,
          user.businessId,
          row.vendorName,
        );
        if (!vendor) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: `Vendor not found: ${row.vendorName}`,
          });
          continue;
        }

        const warehouse = await warehouseRepo.findOne({
          where: {
            id: row.warehouseId,
            businessId: user.businessId,
            deletedAt: IsNull(),
          },
          select: ['id'],
        });
        if (!warehouse) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: row.orderNumber,
            status: 'error',
            error: 'Warehouse not found',
          });
          continue;
        }

        const created = await this.saveImportedPurchaseOrder(tenantDb, {
          businessId: user.businessId,
          actorUserId: user.userId,
          orderNumber: row.orderNumber,
          warehouseId: row.warehouseId,
          vendorId: vendor.id,
          orderDate: parsedDate,
        });

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: row.orderNumber,
          status: 'success',
          metadata: {
            purchaseOrderId: created.id,
            orderNumber: created.orderNumber,
            vendorId: vendor.id,
            vendorName: vendor.name,
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
      description: `Purchase order import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyPurchaseOrderImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importPurchaseOrders(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parsePurchaseOrderRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No purchase order rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PURCHASE_ORDER_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Purchase order import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processPurchaseOrderImportJob(
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
        description: `Purchase order import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await this.notifyPurchaseOrderImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Purchase order import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }

  private parsePurchaseOrderImportNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parsePurchaseOrderImportBoolean(value: unknown): boolean {
    const text = this.sanitizePurchaseOrderImportText(value).toLowerCase();
    return text === '1' || text === 'true' || text === 'yes';
  }

  private parsePurchaseOrderItemRowsFromFile(
    file: Express.Multer.File,
  ): PurchaseOrderItemImportRow[] {
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

    const rows: PurchaseOrderItemImportRow[] = [];

    rawRows.forEach((row, index) => {
      const orderNumber = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(row, 'code', 'orderNumber', 'ordernumber'),
      );
      if (!orderNumber || orderNumber.toLowerCase() === 'code') {
        return;
      }

      const productTitle = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(
          row,
          'productTitle',
          'producttitle',
          'title',
          'productName',
          'productname',
        ),
      );
      const measurementUnit = this.sanitizePurchaseOrderImportText(
        this.getPurchaseOrderImportRowValue(
          row,
          'measurementUnit',
          'measurementunit',
          'uom',
        ),
      );
      const quantity =
        this.parsePurchaseOrderImportNumber(
          this.getPurchaseOrderImportRowValue(row, 'quantity', 'qty'),
        ) ?? 0;
      const unitPrice =
        this.parsePurchaseOrderImportNumber(
          this.getPurchaseOrderImportRowValue(row, 'unitPrice', 'unitprice'),
        ) ?? 0;
      const discount =
        this.parsePurchaseOrderImportNumber(
          this.getPurchaseOrderImportRowValue(row, 'discount'),
        ) ?? 0;
      const tax =
        this.parsePurchaseOrderImportNumber(
          this.getPurchaseOrderImportRowValue(row, 'tax'),
        ) ?? 0;
      const totalPrice =
        this.parsePurchaseOrderImportNumber(
          this.getPurchaseOrderImportRowValue(row, 'totalPrice', 'totalprice', 'total'),
        ) ?? 0;

      rows.push({
        row: index + 2,
        orderNumber,
        productTitle,
        quantity,
        measurementUnit,
        unitPrice,
        discount,
        discountInPercentage: this.parsePurchaseOrderImportBoolean(
          this.getPurchaseOrderImportRowValue(
            row,
            'discountInPercentage',
            'discountinpercentage',
            'discountIsPercentage',
          ),
        ),
        tax,
        totalPrice,
      });
    });

    return rows;
  }

  private async findOrderByNumberForBusiness(
    tenantDb: DataSource,
    businessId: string,
    orderNumber: string,
  ): Promise<PurchaseOrder | null> {
    return tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .innerJoin('po.warehouse', 'warehouse')
      .where('po.orderNumber = :orderNumber', { orderNumber })
      .andWhere('warehouse.businessId = :businessId', { businessId })
      .getOne();
  }

  private async findProductByName(
    tenantDb: DataSource,
    businessId: string,
    productTitle: string,
  ): Promise<Product | null> {
    return tenantDb.getRepository(Product).findOne({
      where: { name: productTitle, businessId, isDelete: false },
      select: ['id', 'name'],
    });
  }

  private async findUomByName(
    tenantDb: DataSource,
    businessId: string,
    measurementUnit: string,
  ): Promise<Uom | null> {
    return tenantDb.getRepository(Uom).findOne({
      where: { name: measurementUnit, businessId },
      select: ['id', 'name'],
    });
  }

  private resolveImportedPurchaseOrderLine(
    row: PurchaseOrderItemImportRow,
    productId: string,
    uomId: string,
    pricing: ProductPricing,
  ): ResolvedLineItem {
    const itemDto: CreatePurchaseOrderItemDto = {
      productId,
      uomId,
      quantity: row.quantity,
      purchaseUnitPrice: row.unitPrice,
      saleUnitPrice: row.unitPrice,
      ...(row.discountInPercentage
        ? { discountPercentage: row.discount }
        : { discountAmount: row.discount }),
    };

    const resolved = this.resolveLineItem(itemDto, pricing);

    if (row.totalPrice > 0) {
      resolved.totalAmount = this.roundAmount(row.totalPrice);
    }

    return resolved;
  }

  private async recalculateOrderTotalsAfterItemImport(
    tenantDb: DataSource,
    orderId: string,
    importedTaxAmount: number,
  ) {
    const items = await tenantDb.getRepository(PurchaseOrderItem).find({
      where: { purchaseOrderId: orderId },
    });

    const orderTotal = this.roundAmount(
      items.reduce((sum, item) => sum + Number(item.totalAmount), 0),
    );
    const taxAmount = this.roundAmount(importedTaxAmount);
    const taxPercentage =
      orderTotal > 0
        ? this.roundAmount((taxAmount / orderTotal) * 100)
        : 0;
    const totalAmount = this.roundAmount(orderTotal + taxAmount);

    await tenantDb.getRepository(PurchaseOrder).update(orderId, {
      orderTotal,
      taxAmount,
      taxPercentage,
      totalAmount,
    });
  }

  private async notifyPurchaseOrderItemsImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Purchase order items import completed'
        : 'Purchase order items import failed';
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
        type: 'purchase_order_items_import',
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

  private async processPurchaseOrderItemsImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: PurchaseOrderItemImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const taxByOrder = new Map<string, number>();
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

        if (!row.quantity || row.quantity < 1) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Quantity must be at least 1',
          });
          continue;
        }

        const order = await this.findOrderByNumberForBusiness(
          tenantDb,
          user.businessId,
          row.orderNumber,
        );
        if (!order) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: `Purchase order not found: ${row.orderNumber}`,
          });
          continue;
        }

        if (order.orderStatus !== OrderStatus.PENDING) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: rowLabel,
            status: 'error',
            error: 'Only pending purchase orders can receive imported items',
          });
          continue;
        }

        const product = await this.findProductByName(
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

        const uom = await this.findUomByName(
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

        const resolvedLine = this.resolveImportedPurchaseOrderLine(
          row,
          product.id,
          uom.id,
          pricing,
        );

        await tenantDb.transaction(async (manager) => {
          await manager
            .getRepository(PurchaseOrderItem)
            .save(this.buildItemEntities(manager, order.id, [resolvedLine]));
        });

        taxByOrder.set(
          order.id,
          this.roundAmount((taxByOrder.get(order.id) ?? 0) + row.tax),
        );
        ordersToRecalculate.add(order.id);

        this.tenantJobService.appendLog(jobId, {
          row: row.row,
          name: rowLabel,
          status: 'success',
          metadata: {
            purchaseOrderId: order.id,
            orderNumber: order.orderNumber,
            productId: product.id,
            productPricingId: pricing.id,
            uomId: uom.id,
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
      await this.recalculateOrderTotalsAfterItemImport(
        tenantDb,
        orderId,
        taxByOrder.get(orderId) ?? 0,
      );
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Purchase order items import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
      },
    });

    await this.notifyPurchaseOrderItemsImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importPurchaseOrderItems(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parsePurchaseOrderItemRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException('No purchase order item rows found in file');
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: user.businessId,
      jobType: 'PURCHASE_ORDER_ITEMS_IMPORT',
      fileName: file.originalname,
      createdBy: user.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Purchase order items import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processPurchaseOrderItemsImportJob(
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
        description: `Purchase order items import failed for ${file.originalname}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: file.originalname,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await this.notifyPurchaseOrderItemsImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Purchase order items import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}