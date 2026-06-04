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
  IsNull,
} from 'typeorm';
import {
  Grn,
  GrnItem,
  GrnStatus,
} from 'src/tenant-db/entities/grn.entity';
import {
  OrderStatus,
  PurchaseOrder,
  PurchaseOrderItem,
} from 'src/tenant-db/entities/purchase-order.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { CreateGrnDto } from '../../dto/grn/create-grn.dto';
import { CreateGrnItemDto } from '../../dto/grn/create-grn-item.dto';
import { UpdateGrnDto } from '../../dto/grn/update-grn.dto';
import { UpdateGrnItemDto } from '../../dto/grn/update-grn-item.dto';
import { ActivityLogService } from '../activity-log.service';
import { StockService } from '../stock.service';
import { TransactionService } from '../transaction.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';

const GRN_NUMBER_PREFIX = 'GRN';

type ResolvedGrnLine = {
  purchaseOrderItemId: string;
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  purchaseUnitPrice: number;
  saleUnitMarginAmount: number;
  saleUnitMarginPercentage: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
};

type GrnTotals = {
  totalTaxAmount: number;
  totalDiscountAmount: number;
  totalAmount: number;
};

type CreateApprovedGrnFromOrderInput = {
  businessId: string;
  order: PurchaseOrder;
  grnDate: Date;
  deliveryCost?: number;
  taxPercentage?: number;
  discountPercentage?: number;
  totalDiscountAmount?: number;
  totalTaxAmount?: number;
  notes?: string | null;
  actorUserId: string;
};

@Injectable()
export class GrnService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
    private readonly purchaseInvoiceService: PurchaseInvoiceService,
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

  private assertPendingStatus(grn: Grn): void {
    if (grn.status !== GrnStatus.PENDING) {
      throw new BadRequestException(
        'Only pending GRNs can be modified or deleted',
      );
    }
  }

  private resolveCreateStatus(status?: GrnStatus): GrnStatus {
    const resolved = status ?? GrnStatus.PENDING;
    if (
      resolved !== GrnStatus.PENDING &&
      resolved !== GrnStatus.APPROVED
    ) {
      throw new BadRequestException(
        'GRN status on create must be PENDING or APPROVED',
      );
    }
    return resolved;
  }

  private async assertVendorForApproval(
    repositorySource: DataSource | EntityManager,
    businessId: string,
    vendorId: string,
  ): Promise<Party> {
    const vendor = await repositorySource.getRepository(Party).findOne({
      where: { id: vendorId, businessId, deletedAt: IsNull() },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (!vendor.payableAccountId) {
      throw new BadRequestException(
        'Vendor payable account is required before approving GRN',
      );
    }

    return vendor;
  }

  /**
   * Posts stock IN, credits vendor payable, and sets status to APPROVED.
   * Idempotent when the GRN is already approved (e.g. safe approve retry).
   */
  private async executeGrnApproval(
    manager: EntityManager,
    businessId: string,
    grn: Grn,
    vendor: Party,
  ): Promise<Grn> {
    if (grn.status === GrnStatus.APPROVED) {
      await this.purchaseInvoiceService.createFromGrn(manager, grn);
      return manager.getRepository(Grn).findOneOrFail({
        where: { id: grn.id },
        relations: this.grnRelations(),
      });
    }

    if (grn.status !== GrnStatus.PENDING) {
      throw new BadRequestException('Only pending GRNs can be approved');
    }

    const items = grn.items ?? [];
    if (!items.length) {
      throw new BadRequestException('GRN must have at least one item to approve');
    }

    if (!vendor.payableAccountId) {
      throw new BadRequestException(
        'Vendor payable account is required before approving GRN',
      );
    }

    await this.stockService.receiveStockIn(manager, {
      businessId,
      warehouseId: grn.warehouseId,
      vendorId: grn.vendorId,
      referenceType: ReferenceType.PURCHASE,
      batchDate: grn.grnDate,
      batchNumberPrefix: grn.grnNumber,
      lines: items
        .filter((item) => item.receivedQuantity > 0)
        .map((item) => ({
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.receivedQuantity,
          purchaseUnitPrice: Number(item.purchaseUnitPrice),
          saleUnitMarginAmount: Number(item.saleUnitMarginAmount),
          saleUnitMarginPercentage: Number(item.saleUnitMarginPercentage),
        })),
    });

    await this.transactionService.postDirectLedgerEntry(manager, {
      businessId,
      chartOfAccountId: vendor.payableAccountId,
      referenceType: AccountTransactionReferenceType.GRN,
      referenceId: grn.id,
      partyId: vendor.id,
      transactionDate: grn.grnDate,
      description: `GRN ${grn.grnNumber} - vendor payable`,
      creditAmount: this.roundAmount(Number(grn.totalAmount)),
    });

    grn.status = GrnStatus.APPROVED;
    await manager.getRepository(Grn).save(grn);

    await this.purchaseInvoiceService.createFromGrn(manager, grn);

    return manager.getRepository(Grn).findOneOrFail({
      where: { id: grn.id },
      relations: this.grnRelations(),
    });
  }

  private grnRelations() {
    return {
      purchaseOrder: true,
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

  private async generateGrnNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(Grn)
      .createQueryBuilder('grn')
      .where('grn.grnNumber LIKE :prefix', {
        prefix: `${GRN_NUMBER_PREFIX}-%`,
      })
      .orderBy('grn.grnNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.grnNumber.replace(`${GRN_NUMBER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${GRN_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private resolveLineFromPoItem(
    poItem: PurchaseOrderItem,
    receivedQuantity: number,
    headerTaxPercentage: number,
  ): ResolvedGrnLine {
    const lineSubtotal = poItem.purchaseUnitPrice * receivedQuantity;
    const discountAmount = this.roundAmount(
      (lineSubtotal * Number(poItem.discountPercentage)) / 100,
    );
    const taxableBase = this.roundAmount(lineSubtotal - discountAmount);
    const taxAmount = this.roundAmount(
      (taxableBase * headerTaxPercentage) / 100,
    );
    const totalAmount = this.roundAmount(taxableBase + taxAmount);

    return {
      purchaseOrderItemId: poItem.id,
      productId: poItem.productId,
      uomId: poItem.uomId,
      productFlavourId: poItem.productFlavourId ?? null,
      orderedQuantity: poItem.quantity,
      receivedQuantity,
      purchaseUnitPrice: Number(poItem.purchaseUnitPrice),
      saleUnitMarginAmount: Number(poItem.saleUnitMarginAmount),
      saleUnitMarginPercentage: Number(poItem.saleUnitMarginPercentage),
      discountPercentage: Number(poItem.discountPercentage),
      discountAmount,
      taxPercentage: headerTaxPercentage,
      taxAmount,
      totalAmount,
    };
  }

  private computeGrnTotals(
    lines: ResolvedGrnLine[],
    options: {
      deliveryCost?: number;
      taxPercentage?: number;
      discountPercentage?: number;
      totalDiscountAmount?: number;
      totalTaxAmount?: number;
    },
  ): GrnTotals {
    const lineDiscountTotal = this.roundAmount(
      lines.reduce((sum, line) => sum + line.discountAmount, 0),
    );
    const lineBase = this.roundAmount(
      lines.reduce(
        (sum, line) =>
          sum + line.purchaseUnitPrice * line.receivedQuantity,
        0,
      ) - lineDiscountTotal,
    );
    const deliveryCost = this.roundAmount(options.deliveryCost ?? 0);
    const discountPercentage = this.roundAmount(options.discountPercentage ?? 0);
    const headerDiscountAmount = this.roundAmount(
      (lineBase * discountPercentage) / 100,
    );
    const totalDiscountAmount =
      options.totalDiscountAmount != null
        ? this.roundAmount(options.totalDiscountAmount)
        : this.roundAmount(lineDiscountTotal + headerDiscountAmount);
    const taxableBase = this.roundAmount(lineBase - headerDiscountAmount);
    const taxPercentage = this.roundAmount(options.taxPercentage ?? 0);
    const totalTaxAmount =
      options.totalTaxAmount != null
        ? this.roundAmount(options.totalTaxAmount)
        : taxPercentage > 0
          ? this.roundAmount((taxableBase * taxPercentage) / 100)
          : this.roundAmount(
              lines.reduce((sum, line) => sum + line.taxAmount, 0),
            );
    const totalAmount = this.roundAmount(
      taxableBase + totalTaxAmount + deliveryCost,
    );

    return { totalTaxAmount, totalDiscountAmount, totalAmount };
  }

  private buildItemEntities(
    manager: EntityManager,
    grnId: string,
    lines: ResolvedGrnLine[],
  ): GrnItem[] {
    const itemRepo = manager.getRepository(GrnItem);
    return lines.map((line) =>
      itemRepo.create({
        grnId,
        productId: line.productId,
        productFlavourId: line.productFlavourId,
        uomId: line.uomId,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: line.receivedQuantity,
        purchaseUnitPrice: line.purchaseUnitPrice,
        saleUnitMarginAmount: line.saleUnitMarginAmount,
        saleUnitMarginPercentage: line.saleUnitMarginPercentage,
        discountPercentage: line.discountPercentage,
        discountAmount: line.discountAmount,
        taxPercentage: line.taxPercentage,
        taxAmount: line.taxAmount,
        totalAmount: line.totalAmount,
      }),
    );
  }

  private async getApprovedReceivedByPoItem(
    manager: EntityManager,
    purchaseOrderId: string,
    excludeGrnId?: string,
  ): Promise<Map<string, number>> {
    const qb = manager
      .getRepository(GrnItem)
      .createQueryBuilder('item')
      .innerJoin('item.grn', 'grn')
      .where('grn.purchaseOrderId = :purchaseOrderId', { purchaseOrderId })
      .andWhere('grn.status = :status', { status: GrnStatus.APPROVED });

    if (excludeGrnId) {
      qb.andWhere('grn.id != :excludeGrnId', { excludeGrnId });
    }

    const rows = await qb
      .select('item.productId', 'productId')
      .addSelect('item.uomId', 'uomId')
      .addSelect('item.productFlavourId', 'productFlavourId')
      .addSelect('SUM(item.receivedQuantity)', 'received')
      .groupBy('item.productId')
      .addGroupBy('item.uomId')
      .addGroupBy('item.productFlavourId')
      .getRawMany<{
        productId: string;
        uomId: string;
        productFlavourId: string | null;
        received: string;
      }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.productId}:${row.uomId}:${row.productFlavourId ?? ''}`;
      map.set(key, Number(row.received) || 0);
    }
    return map;
  }

  private poItemKey(item: PurchaseOrderItem): string {
    return `${item.productId}:${item.uomId}:${item.productFlavourId ?? ''}`;
  }

  private resolveCreateLines(
    order: PurchaseOrder,
    dtoItems: CreateGrnItemDto[] | undefined,
    priorReceived: Map<string, number>,
    headerTaxPercentage: number,
  ): ResolvedGrnLine[] {
    const poItemsById = new Map(
      (order.items ?? []).map((item) => [item.id, item]),
    );

    const inputItems =
      dtoItems ??
      (order.items ?? []).map((item) => ({
        purchaseOrderItemId: item.id,
        receivedQuantity: item.quantity,
      }));

    const lines: ResolvedGrnLine[] = [];

    for (const input of inputItems) {
      const poItem = poItemsById.get(input.purchaseOrderItemId);
      if (!poItem) {
        throw new BadRequestException(
          `Purchase order item ${input.purchaseOrderItemId} not found on this order`,
        );
      }

      if (input.receivedQuantity < 0) {
        throw new BadRequestException('Received quantity cannot be negative');
      }

      if (input.receivedQuantity > poItem.quantity) {
        throw new BadRequestException(
          `Received quantity cannot exceed ordered quantity for product ${poItem.productId}`,
        );
      }

      const key = this.poItemKey(poItem);
      const alreadyReceived = priorReceived.get(key) ?? 0;
      if (alreadyReceived + input.receivedQuantity > poItem.quantity) {
        throw new BadRequestException(
          `Total received quantity would exceed ordered quantity for product ${poItem.productId}`,
        );
      }

      if (input.receivedQuantity === 0) {
        continue;
      }

      lines.push(
        this.resolveLineFromPoItem(poItem, input.receivedQuantity, headerTaxPercentage),
      );
    }

    if (!lines.length) {
      throw new BadRequestException('At least one line with received quantity is required');
    }

    return lines;
  }

  private resolveUpdateLines(
    order: PurchaseOrder,
    dtoItems: UpdateGrnItemDto[],
    priorReceived: Map<string, number>,
    headerTaxPercentage: number,
  ): ResolvedGrnLine[] {
    return this.resolveCreateLines(
      order,
      dtoItems.map((item) => ({
        purchaseOrderItemId: item.purchaseOrderItemId,
        receivedQuantity: item.receivedQuantity,
      })),
      priorReceived,
      headerTaxPercentage,
    );
  }

  private async findApprovedPurchaseOrder(
    tenantDb: DataSource,
    businessId: string,
    purchaseOrderId: string,
  ): Promise<PurchaseOrder> {
    const order = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .innerJoin('po.warehouse', 'warehouse')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .where('po.id = :purchaseOrderId', { purchaseOrderId })
      .andWhere('po.businessId = :businessId', { businessId })
      .andWhere('po.orderStatus = :status', { status: OrderStatus.APPROVED })
      .getOne();

    if (!order) {
      throw new NotFoundException(
        'Approved purchase order not found for this business',
      );
    }

    if (!order.vendor) {
      throw new BadRequestException('Purchase order vendor is required');
    }

    if (
      order.vendor.type !== PartyType.VENDOR &&
      order.vendor.type !== PartyType.BOTH
    ) {
      throw new BadRequestException('Purchase order party must be a vendor');
    }

    return order;
  }

  async createApprovedFromOrder(
    manager: EntityManager,
    input: CreateApprovedGrnFromOrderInput,
  ): Promise<Grn> {
    const { businessId, order } = input;

    if (order.orderStatus !== OrderStatus.APPROVED) {
      throw new BadRequestException(
        'Purchase order must be approved before creating an approved GRN',
      );
    }

    if (!order.items?.length) {
      throw new BadRequestException('Purchase order must have items');
    }

    const vendor = await this.assertVendorForApproval(
      manager,
      businessId,
      order.vendorId,
    );
    const taxPercentage = this.roundAmount(
      input.taxPercentage ?? Number(order.taxPercentage),
    );
    const priorReceived = await this.getApprovedReceivedByPoItem(
      manager,
      order.id,
    );
    const resolvedLines = this.resolveCreateLines(
      order,
      undefined,
      priorReceived,
      taxPercentage,
    );
    const totals = this.computeGrnTotals(resolvedLines, {
      deliveryCost: input.deliveryCost ?? Number(order.deliveryCost),
      taxPercentage,
      discountPercentage:
        input.discountPercentage ?? Number(order.discountPercentage),
      totalDiscountAmount: input.totalDiscountAmount,
      totalTaxAmount: input.totalTaxAmount,
    });
    const grnNumber = await this.generateGrnNumber(manager);
    const existingNumber = await manager.getRepository(Grn).findOne({
      where: { grnNumber },
    });
    if (existingNumber) {
      throw new ConflictException('GRN with this number already exists');
    }

    const grnRepo = manager.getRepository(Grn);
    const grn = await grnRepo.save(
      grnRepo.create({
        purchaseOrderId: order.id,
        businessId,
        warehouseId: order.warehouseId,
        vendorId: order.vendorId,
        grnNumber,
        grnDate: input.grnDate,
        notes: input.notes?.trim() || null,
        deliveryCost: input.deliveryCost ?? Number(order.deliveryCost),
        createdBy: input.actorUserId,
        totalTaxAmount: totals.totalTaxAmount,
        totalDiscountAmount: totals.totalDiscountAmount,
        totalAmount: totals.totalAmount,
        status: GrnStatus.PENDING,
      }),
    );

    await manager
      .getRepository(GrnItem)
      .save(this.buildItemEntities(manager, grn.id, resolvedLines));

    const loaded = await grnRepo.findOneOrFail({
      where: { id: grn.id },
      relations: this.grnRelations(),
    });

    return this.executeGrnApproval(manager, businessId, loaded, vendor);
  }

  private async findGrnForBusiness(
    tenantDb: DataSource,
    businessId: string,
    grnId: string,
  ): Promise<Grn> {
    const grn = await tenantDb
      .getRepository(Grn)
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('grn.warehouse', 'warehouse')
      .leftJoinAndSelect('grn.vendor', 'vendor')
      .leftJoinAndSelect('grn.createdByUser', 'createdByUser')
      .leftJoinAndSelect('grn.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('grn.id = :grnId', { grnId })
      .andWhere('grn.businessId = :businessId', { businessId })
      .andWhere('grn.deletedAt IS NULL')
      .getOne();

    if (!grn) {
      throw new NotFoundException('GRN not found');
    }

    return grn;
  }

  private mapGrn(grn: Grn) {
    const items = (grn.items ?? []).map((item) => ({
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
        ? { id: item.productFlavour.id, flavourId: item.productFlavour.flavourId }
        : null,
      uomId: item.uomId,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : null,
      orderedQuantity: item.orderedQuantity,
      receivedQuantity: item.receivedQuantity,
      purchaseUnitPrice: item.purchaseUnitPrice,
      saleUnitMarginAmount: item.saleUnitMarginAmount,
      saleUnitMarginPercentage: item.saleUnitMarginPercentage,
      discountPercentage: item.discountPercentage,
      discountAmount: item.discountAmount,
      taxPercentage: item.taxPercentage,
      taxAmount: item.taxAmount,
      totalAmount: item.totalAmount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return {
      id: grn.id,
      purchaseOrderId: grn.purchaseOrderId,
      purchaseOrder: grn.purchaseOrder
        ? {
            id: grn.purchaseOrder.id,
            orderNumber: grn.purchaseOrder.orderNumber,
            orderStatus: grn.purchaseOrder.orderStatus,
          }
        : null,
      businessId: grn.businessId,
      warehouseId: grn.warehouseId,
      warehouse: grn.warehouse
        ? {
            id: grn.warehouse.id,
            name: grn.warehouse.name,
            code: grn.warehouse.code,
          }
        : null,
      vendorId: grn.vendorId,
      vendor: grn.vendor
        ? {
            id: grn.vendor.id,
            code: grn.vendor.code,
            name: grn.vendor.name,
            type: grn.vendor.type,
          }
        : null,
      grnNumber: grn.grnNumber,
      grnDate: grn.grnDate,
      notes: grn.notes,
      deliveryCost: grn.deliveryCost,
      totalTaxAmount: grn.totalTaxAmount,
      totalDiscountAmount: grn.totalDiscountAmount,
      totalAmount: grn.totalAmount,
      status: grn.status,
      createdBy: grn.createdBy,
      createdByUser: grn.createdByUser
        ? {
            id: grn.createdByUser.id,
            name: grn.createdByUser.name,
            email: grn.createdByUser.email,
          }
        : null,
      items,
      createdAt: grn.createdAt,
      updatedAt: grn.updatedAt,
    };
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateGrnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findApprovedPurchaseOrder(
      tenantDb,
      scopedBusinessId,
      dto.purchaseOrderId,
    );

    const taxPercentage = this.roundAmount(
      dto.taxPercentage ?? Number(order.taxPercentage),
    );
    const priorReceived = await this.getApprovedReceivedByPoItem(
      tenantDb.manager,
      order.id,
    );
    const resolvedLines = this.resolveCreateLines(
      order,
      dto.items,
      priorReceived,
      taxPercentage,
    );
    const totals = this.computeGrnTotals(resolvedLines, {
      deliveryCost: dto.deliveryCost ?? Number(order.deliveryCost),
      taxPercentage,
      discountPercentage:
        dto.discountPercentage ?? Number(order.discountPercentage),
      totalDiscountAmount: dto.totalDiscountAmount,
      totalTaxAmount: dto.totalTaxAmount,
    });

    const targetStatus = this.resolveCreateStatus(dto.status);
    const approveOnCreate = targetStatus === GrnStatus.APPROVED;

    const vendor = approveOnCreate
      ? await this.assertVendorForApproval(
          tenantDb,
          scopedBusinessId,
          order.vendorId,
        )
      : null;

    const grnNumber =
      dto.grnNumber?.trim() || (await this.generateGrnNumber(tenantDb));

    const existingNumber = await tenantDb.getRepository(Grn).findOne({
      where: { grnNumber },
    });
    if (existingNumber) {
      throw new ConflictException('GRN with this number already exists');
    }

    const created = await tenantDb.transaction(async (manager) => {
      const grnRepo = manager.getRepository(Grn);
      const grn = await grnRepo.save(
        grnRepo.create({
          purchaseOrderId: order.id,
          businessId: scopedBusinessId,
          warehouseId: order.warehouseId,
          vendorId: order.vendorId,
          grnNumber,
          grnDate: new Date(dto.grnDate),
          notes: dto.notes?.trim() || null,
          deliveryCost: dto.deliveryCost ?? Number(order.deliveryCost),
          createdBy: actorUserId,
          totalTaxAmount: totals.totalTaxAmount,
          totalDiscountAmount: totals.totalDiscountAmount,
          totalAmount: totals.totalAmount,
          status: GrnStatus.PENDING,
        }),
      );

      await manager
        .getRepository(GrnItem)
        .save(this.buildItemEntities(manager, grn.id, resolvedLines));

      const loaded = await grnRepo.findOneOrFail({
        where: { id: grn.id },
        relations: this.grnRelations(),
      });

      if (approveOnCreate) {
        return this.executeGrnApproval(
          manager,
          scopedBusinessId,
          loaded,
          vendor!,
        );
      }

      return loaded;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: approveOnCreate ? 'GRN_CREATED_AND_APPROVED' : 'GRN_CREATED',
      description: approveOnCreate
        ? `GRN ${created.grnNumber} created and approved from PO ${order.orderNumber}`
        : `GRN ${created.grnNumber} created from PO ${order.orderNumber}`,
      metadata: {
        grnId: created.id,
        grnNumber: created.grnNumber,
        purchaseOrderId: order.id,
        status: created.status,
      },
    });

    return { data: this.mapGrn(created) };
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
      purchaseOrderId?: string;
      status?: GrnStatus;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(Grn)
      .createQueryBuilder('grn')
      .leftJoinAndSelect('grn.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('grn.warehouse', 'warehouse')
      .leftJoinAndSelect('grn.vendor', 'vendor')
      .leftJoinAndSelect('grn.createdByUser', 'createdByUser')
      .leftJoinAndSelect('grn.items', 'items')
      .where('grn.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('grn.deletedAt IS NULL');

    if (options.vendorId) {
      qb.andWhere('grn.vendorId = :vendorId', { vendorId: options.vendorId });
    }
    if (options.warehouseId) {
      qb.andWhere('grn.warehouseId = :warehouseId', {
        warehouseId: options.warehouseId,
      });
    }
    if (options.purchaseOrderId) {
      qb.andWhere('grn.purchaseOrderId = :purchaseOrderId', {
        purchaseOrderId: options.purchaseOrderId,
      });
    }
    if (options.status) {
      qb.andWhere('grn.status = :status', { status: options.status });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('grn.grnNumber ILIKE :search', { search })
            .orWhere('vendor.name ILIKE :search', { search })
            .orWhere('vendor.code ILIKE :search', { search })
            .orWhere('purchaseOrder.orderNumber ILIKE :search', { search });
        }),
      );
    }

    const [grns, total] = await qb
      .orderBy('grn.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'GRN_LISTED',
      description: 'GRNs listed',
      metadata: { total, page, limit },
    });

    return {
      data: grns.map((grn) => this.mapGrn(grn)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    grnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const grn = await this.findGrnForBusiness(
      tenantDb,
      scopedBusinessId,
      grnId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'GRN_VIEWED',
      description: `GRN ${grn.grnNumber} viewed`,
      metadata: { grnId: grn.id },
    });

    return { data: this.mapGrn(grn) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    grnId: string,
    dto: UpdateGrnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const grn = await this.findGrnForBusiness(
      tenantDb,
      scopedBusinessId,
      grnId,
    );
    this.assertPendingStatus(grn);

    const order = await this.findApprovedPurchaseOrder(
      tenantDb,
      scopedBusinessId,
      grn.purchaseOrderId,
    );

    const taxPercentage = this.roundAmount(
      dto.taxPercentage ?? Number(order.taxPercentage),
    );

    const updated = await tenantDb.transaction(async (manager) => {
      const grnRepo = manager.getRepository(Grn);

      if (dto.grnNumber !== undefined) {
        const nextNumber = dto.grnNumber.trim();
        if (!nextNumber) {
          throw new BadRequestException('GRN number cannot be empty');
        }
        if (nextNumber !== grn.grnNumber) {
          const taken = await grnRepo.findOne({ where: { grnNumber: nextNumber } });
          if (taken) {
            throw new ConflictException('GRN with this number already exists');
          }
          grn.grnNumber = nextNumber;
        }
      }

      if (dto.grnDate !== undefined) {
        grn.grnDate = new Date(dto.grnDate);
      }
      if (dto.notes !== undefined) {
        grn.notes = dto.notes?.trim() || null;
      }
      if (dto.deliveryCost !== undefined) {
        grn.deliveryCost = dto.deliveryCost;
      }

      let resolvedLines: ResolvedGrnLine[] | null = null;

      if (dto.items !== undefined) {
        const priorReceived = await this.getApprovedReceivedByPoItem(
          manager,
          order.id,
          grn.id,
        );
        resolvedLines = this.resolveUpdateLines(
          order,
          dto.items,
          priorReceived,
          taxPercentage,
        );

        await manager.getRepository(GrnItem).delete({ grnId: grn.id });
        await manager
          .getRepository(GrnItem)
          .save(this.buildItemEntities(manager, grn.id, resolvedLines));
      } else {
        const existingItems = await manager.getRepository(GrnItem).find({
          where: { grnId: grn.id },
        });
        resolvedLines = existingItems.map((item) => ({
          purchaseOrderItemId: '',
          productId: item.productId,
          uomId: item.uomId,
          productFlavourId: item.productFlavourId,
          orderedQuantity: item.orderedQuantity,
          receivedQuantity: item.receivedQuantity,
          purchaseUnitPrice: Number(item.purchaseUnitPrice),
          saleUnitMarginAmount: Number(item.saleUnitMarginAmount),
          saleUnitMarginPercentage: Number(item.saleUnitMarginPercentage),
          discountPercentage: Number(item.discountPercentage),
          discountAmount: Number(item.discountAmount),
          taxPercentage: Number(item.taxPercentage),
          taxAmount: Number(item.taxAmount),
          totalAmount: Number(item.totalAmount),
        }));
      }

      const totals = this.computeGrnTotals(resolvedLines, {
        deliveryCost: grn.deliveryCost,
        taxPercentage,
        discountPercentage:
          dto.discountPercentage ?? Number(order.discountPercentage),
        totalDiscountAmount: dto.totalDiscountAmount,
        totalTaxAmount: dto.totalTaxAmount,
      });

      await grnRepo.update(grn.id, {
        grnNumber: grn.grnNumber,
        grnDate: grn.grnDate,
        notes: grn.notes,
        deliveryCost: grn.deliveryCost,
        totalTaxAmount: totals.totalTaxAmount,
        totalDiscountAmount: totals.totalDiscountAmount,
        totalAmount: totals.totalAmount,
      });

      return grnRepo.findOneOrFail({
        where: { id: grn.id },
        relations: this.grnRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'GRN_UPDATED',
      description: `GRN ${updated.grnNumber} updated`,
      metadata: { grnId: updated.id },
    });

    return { data: this.mapGrn(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    grnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const grn = await this.findGrnForBusiness(
      tenantDb,
      scopedBusinessId,
      grnId,
    );
    this.assertPendingStatus(grn);

    await tenantDb.getRepository(Grn).softRemove(grn);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'GRN_DELETED',
      description: `GRN ${grn.grnNumber} deleted`,
      metadata: { grnId: grn.id },
    });

    return {
      message: 'GRN deleted',
      data: { id: grn.id, grnNumber: grn.grnNumber },
    };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    grnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const grn = await this.findGrnForBusiness(
      tenantDb,
      scopedBusinessId,
      grnId,
    );

    if (grn.status === GrnStatus.APPROVED) {
      return {
        data: this.mapGrn(grn),
        message: 'GRN is already approved',
      };
    }

    const vendor = await this.assertVendorForApproval(
      tenantDb,
      scopedBusinessId,
      grn.vendorId,
    );

    const approved = await tenantDb.transaction(async (manager) =>
      this.executeGrnApproval(manager, scopedBusinessId, grn, vendor),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'GRN_APPROVED',
      description: `GRN ${approved.grnNumber} approved — stock received, vendor payable credited`,
      metadata: { grnId: approved.id, totalAmount: approved.totalAmount },
    });

    return { data: this.mapGrn(approved) };
  }
}
