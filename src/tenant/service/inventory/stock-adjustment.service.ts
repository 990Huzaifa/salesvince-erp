import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, IsNull } from 'typeorm';
import {
  StockAdjustment,
  StockAdjustmentDirection,
  StockAdjustmentItem,
  StockAdjustmentStatus,
} from 'src/tenant-db/entities/stock-adjustment.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import {
  Product,
  ProductFlavour,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import {
  ReferenceType,
  StockBalance,
} from 'src/tenant-db/entities/stock.entity';
import { CreateStockAdjustmentDto } from '../../dto/stock-adjustment/create-stock-adjustment.dto';
import { UpdateStockAdjustmentDto } from '../../dto/stock-adjustment/update-stock-adjustment.dto';
import { CreateStockAdjustmentItemDto } from '../../dto/stock-adjustment/create-stock-adjustment-item.dto';
import { StockService } from '../stock.service';
import { ActivityLogService } from '../activity-log.service';

const ADJUSTMENT_NUMBER_PREFIX = 'ADJ';

type ResolvedAdjustmentLine = {
  productId: string;
  productFlavourId: string | null;
  uomId: string;
  direction: StockAdjustmentDirection;
  quantity: number;
  purchaseUnitPrice: number | null;
  saleUnitPrice: number | null;
  batchNumber: string | null;
  expiryDate: Date | null;
  reason: string | null;
};

@Injectable()
export class StockAdjustmentService {
  constructor(
    private readonly stockService: StockService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundQuantity(value: number): number {
    return Math.round(value);
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private assertPendingStatus(adjustment: StockAdjustment): void {
    if (adjustment.status !== StockAdjustmentStatus.PENDING) {
      throw new BadRequestException(
        'Only pending stock adjustments can be modified',
      );
    }
  }

  private mapItem(item: StockAdjustmentItem) {
    return {
      id: item.id,
      stockAdjustmentId: item.stockAdjustmentId,
      productId: item.productId,
      productFlavourId: item.productFlavourId,
      uomId: item.uomId,
      direction: item.direction,
      quantity: item.quantity,
      purchaseUnitPrice:
        item.purchaseUnitPrice != null ? Number(item.purchaseUnitPrice) : null,
      saleUnitPrice:
        item.saleUnitPrice != null ? Number(item.saleUnitPrice) : null,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      reason: item.reason,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            barcode: item.product.barcode,
          }
        : undefined,
      productFlavour: item.productFlavour
        ? { id: item.productFlavour.id }
        : null,
      uom: item.uom
        ? { id: item.uom.id, name: item.uom.name }
        : undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapAdjustment(adjustment: StockAdjustment) {
    return {
      id: adjustment.id,
      businessId: adjustment.businessId,
      adjustmentNumber: adjustment.adjustmentNumber,
      adjustmentDate: adjustment.adjustmentDate,
      warehouseId: adjustment.warehouseId,
      warehouse: adjustment.warehouse
        ? {
            id: adjustment.warehouse.id,
            code: adjustment.warehouse.code,
            name: adjustment.warehouse.name,
          }
        : undefined,
      notes: adjustment.notes,
      createdBy: adjustment.createdBy,
      status: adjustment.status,
      items: (adjustment.items ?? []).map((item) => this.mapItem(item)),
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
  }

  private async generateAdjustmentNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(StockAdjustment)
      .createQueryBuilder('sa')
      .where('sa.adjustmentNumber LIKE :prefix', {
        prefix: `${ADJUSTMENT_NUMBER_PREFIX}-%`,
      })
      .orderBy('sa.adjustmentNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.adjustmentNumber.replace(
        `${ADJUSTMENT_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${ADJUSTMENT_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertWarehouseForBusiness(
    manager: EntityManager | DataSource,
    businessId: string,
    warehouseId: string,
  ): Promise<Warehouse> {
    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${warehouseId} not found`);
    }

    return warehouse;
  }

  private async assertProductForBusiness(
    manager: EntityManager,
    businessId: string,
    productId: string,
  ): Promise<Product> {
    const product = await manager.getRepository(Product).findOne({
      where: { id: productId, businessId, isDelete: false },
    });

    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    if (!product.isActive) {
      throw new BadRequestException(`Product ${productId} is inactive`);
    }

    return product;
  }

  private async assertUomForBusiness(
    manager: EntityManager,
    businessId: string,
    uomId: string,
  ): Promise<Uom> {
    const uom = await manager.getRepository(Uom).findOne({
      where: { id: uomId, businessId },
    });

    if (!uom) {
      throw new NotFoundException(`UOM ${uomId} not found`);
    }

    return uom;
  }

  private async assertFlavourForProduct(
    manager: EntityManager,
    productId: string,
    productFlavourId: string,
  ): Promise<void> {
    const flavour = await manager.getRepository(ProductFlavour).findOne({
      where: { id: productFlavourId, productId },
    });

    if (!flavour) {
      throw new BadRequestException(
        `Flavour ${productFlavourId} does not belong to product ${productId}`,
      );
    }
  }

  private async assertStockAvailability(
    manager: EntityManager,
    businessId: string,
    warehouseId: string,
    productId: string,
    uomId: string,
    quantity: number,
  ): Promise<void> {
    const balance = await manager.getRepository(StockBalance).findOne({
      where: {
        businessId,
        warehouseId,
        productId,
        uomId,
        deletedAt: IsNull(),
      },
    });

    const available = Number(balance?.quantityAvailable ?? 0);

    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient stock for product ${productId} in warehouse (available: ${available}, requested: ${quantity})`,
      );
    }
  }

  private lineKey(line: {
    productId: string;
    uomId: string;
    productFlavourId?: string | null;
    direction: StockAdjustmentDirection;
  }): string {
    return `${line.direction}:${line.productId}:${line.uomId}:${line.productFlavourId ?? ''}`;
  }

  private async resolveItems(
    manager: EntityManager,
    businessId: string,
    warehouseId: string,
    items: CreateStockAdjustmentItemDto[],
    checkAvailability: boolean,
  ): Promise<ResolvedAdjustmentLine[]> {
    if (!items?.length) {
      throw new BadRequestException(
        'At least one adjustment item is required',
      );
    }

    const seen = new Set<string>();
    const resolved: ResolvedAdjustmentLine[] = [];

    for (const item of items) {
      const quantity = this.roundQuantity(item.quantity);
      if (quantity <= 0) {
        throw new BadRequestException(
          'Adjustment quantity must be greater than zero',
        );
      }

      if (
        item.direction !== StockAdjustmentDirection.INCREASE &&
        item.direction !== StockAdjustmentDirection.DECREASE
      ) {
        throw new BadRequestException(
          'Adjustment direction must be INCREASE or DECREASE',
        );
      }

      await this.assertProductForBusiness(manager, businessId, item.productId);
      await this.assertUomForBusiness(manager, businessId, item.uomId);

      if (item.productFlavourId) {
        await this.assertFlavourForProduct(
          manager,
          item.productId,
          item.productFlavourId,
        );
      }

      const key = this.lineKey(item);
      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate adjustment line for the same direction, product, UOM, and flavour',
        );
      }
      seen.add(key);

      let purchaseUnitPrice: number | null = null;
      let saleUnitPrice: number | null = null;

      if (item.direction === StockAdjustmentDirection.INCREASE) {
        if (
          item.purchaseUnitPrice == null ||
          item.saleUnitPrice == null ||
          Number.isNaN(Number(item.purchaseUnitPrice)) ||
          Number.isNaN(Number(item.saleUnitPrice))
        ) {
          throw new BadRequestException(
            'purchaseUnitPrice and saleUnitPrice are required for INCREASE lines',
          );
        }
        purchaseUnitPrice = this.roundAmount(Number(item.purchaseUnitPrice));
        saleUnitPrice = this.roundAmount(Number(item.saleUnitPrice));
      }

      if (
        checkAvailability &&
        item.direction === StockAdjustmentDirection.DECREASE
      ) {
        await this.assertStockAvailability(
          manager,
          businessId,
          warehouseId,
          item.productId,
          item.uomId,
          quantity,
        );
      }

      resolved.push({
        productId: item.productId,
        productFlavourId: item.productFlavourId ?? null,
        uomId: item.uomId,
        direction: item.direction,
        quantity,
        purchaseUnitPrice,
        saleUnitPrice,
        batchNumber: item.batchNumber?.trim() || null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        reason: item.reason?.trim() || null,
      });
    }

    return resolved;
  }

  private async findAdjustmentForBusiness(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    adjustmentId: string,
    withRelations = true,
  ): Promise<StockAdjustment> {
    const qb = tenantDb
      .getRepository(StockAdjustment)
      .createQueryBuilder('sa')
      .where('sa.id = :adjustmentId', { adjustmentId })
      .andWhere('sa.businessId = :businessId', { businessId })
      .andWhere('sa.deletedAt IS NULL');

    if (withRelations) {
      qb.leftJoinAndSelect('sa.items', 'items')
        .leftJoinAndSelect('items.product', 'product')
        .leftJoinAndSelect('items.productFlavour', 'productFlavour')
        .leftJoinAndSelect('items.uom', 'uom')
        .leftJoinAndSelect('sa.warehouse', 'warehouse');
    }

    const adjustment = await qb.getOne();
    if (!adjustment) {
      throw new NotFoundException('Stock adjustment not found');
    }

    return adjustment;
  }

  private async postStockAdjustment(
    manager: EntityManager,
    adjustment: StockAdjustment,
  ): Promise<void> {
    const items = adjustment.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Stock adjustment must have at least one item to approve',
      );
    }

    const increaseLines = items.filter(
      (item) => item.direction === StockAdjustmentDirection.INCREASE,
    );
    const decreaseLines = items.filter(
      (item) => item.direction === StockAdjustmentDirection.DECREASE,
    );

    for (const item of decreaseLines) {
      await this.assertStockAvailability(
        manager,
        adjustment.businessId,
        adjustment.warehouseId,
        item.productId,
        item.uomId,
        item.quantity,
      );
    }

    if (decreaseLines.length) {
      await this.stockService.consumeStockOut(manager, {
        businessId: adjustment.businessId,
        warehouseId: adjustment.warehouseId,
        referenceType: ReferenceType.ADJUSTMENT,
        lines: decreaseLines.map((item) => ({
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
        })),
      });
    }

    if (increaseLines.length) {
      await this.stockService.receiveStockIn(manager, {
        businessId: adjustment.businessId,
        warehouseId: adjustment.warehouseId,
        vendorId: null,
        referenceType: ReferenceType.ADJUSTMENT,
        batchDate: adjustment.adjustmentDate,
        batchNumberPrefix: ADJUSTMENT_NUMBER_PREFIX,
        lines: increaseLines.map((item) => ({
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
          purchaseUnitPrice: Number(item.purchaseUnitPrice ?? 0),
          saleUnitPrice: Number(item.saleUnitPrice ?? 0),
          expiryDate: item.expiryDate ?? null,
          batchNumber: item.batchNumber ?? undefined,
        })),
      });
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateStockAdjustmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const targetStatus = dto.status ?? StockAdjustmentStatus.PENDING;
    const approveOnCreate = targetStatus === StockAdjustmentStatus.APPROVED;

    const created = await tenantDb.transaction(async (manager) => {
      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        dto.warehouseId,
      );

      const resolvedItems = await this.resolveItems(
        manager,
        scopedBusinessId,
        dto.warehouseId,
        dto.items,
        approveOnCreate,
      );

      const adjustmentNumber =
        dto.adjustmentNumber?.trim() ||
        (await this.generateAdjustmentNumber(manager));

      const existing = await manager.getRepository(StockAdjustment).findOne({
        where: { adjustmentNumber, deletedAt: IsNull() },
      });
      if (existing) {
        throw new BadRequestException(
          `Adjustment number ${adjustmentNumber} already exists`,
        );
      }

      const adjustment = manager.getRepository(StockAdjustment).create({
        businessId: scopedBusinessId,
        adjustmentNumber,
        adjustmentDate: new Date(dto.adjustmentDate),
        warehouseId: dto.warehouseId,
        notes: dto.notes?.trim() || null,
        createdBy: actorUserId,
        status: StockAdjustmentStatus.PENDING,
      });

      const saved = await manager.getRepository(StockAdjustment).save(adjustment);

      const itemEntities = resolvedItems.map((line) =>
        manager.getRepository(StockAdjustmentItem).create({
          stockAdjustmentId: saved.id,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          direction: line.direction,
          quantity: line.quantity,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitPrice: line.saleUnitPrice,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          reason: line.reason,
        }),
      );
      await manager.getRepository(StockAdjustmentItem).save(itemEntities);

      const withItems = await this.findAdjustmentForBusiness(
        manager,
        scopedBusinessId,
        saved.id,
      );

      if (approveOnCreate) {
        await this.postStockAdjustment(manager, withItems);
        withItems.status = StockAdjustmentStatus.APPROVED;
        await manager.getRepository(StockAdjustment).save(withItems);
      }

      return this.findAdjustmentForBusiness(
        manager,
        scopedBusinessId,
        saved.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: approveOnCreate
        ? 'STOCK_ADJUSTMENT_CREATED_AND_APPROVED'
        : 'STOCK_ADJUSTMENT_CREATED',
      description: approveOnCreate
        ? `Stock adjustment ${created.adjustmentNumber} created and approved`
        : `Stock adjustment ${created.adjustmentNumber} created`,
      metadata: {
        stockAdjustmentId: created.id,
        warehouseId: created.warehouseId,
      },
    });

    return { data: this.mapAdjustment(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      warehouseId?: string;
      status?: StockAdjustmentStatus;
    },
    _actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, Math.min(100, options.limit));
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(StockAdjustment)
      .createQueryBuilder('sa')
      .leftJoinAndSelect('sa.warehouse', 'warehouse')
      .leftJoinAndSelect('sa.items', 'items')
      .where('sa.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('sa.deletedAt IS NULL');

    if (options.warehouseId) {
      qb.andWhere('sa.warehouseId = :warehouseId', {
        warehouseId: options.warehouseId,
      });
    }

    if (options.status) {
      qb.andWhere('sa.status = :status', { status: options.status });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('sa.adjustmentNumber ILIKE :search', { search })
            .orWhere('sa.notes ILIKE :search', { search })
            .orWhere('warehouse.name ILIKE :search', { search })
            .orWhere('warehouse.code ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy('sa.adjustmentDate', 'DESC')
      .addOrderBy('sa.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.mapAdjustment(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    adjustmentId: string,
    _actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const adjustment = await this.findAdjustmentForBusiness(
      tenantDb,
      scopedBusinessId,
      adjustmentId,
    );
    return { data: this.mapAdjustment(adjustment) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    adjustmentId: string,
    dto: UpdateStockAdjustmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const adjustment = await this.findAdjustmentForBusiness(
        manager,
        scopedBusinessId,
        adjustmentId,
      );
      this.assertPendingStatus(adjustment);

      const warehouseId = dto.warehouseId ?? adjustment.warehouseId;

      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        warehouseId,
      );

      if (dto.adjustmentNumber?.trim()) {
        const nextNumber = dto.adjustmentNumber.trim();
        if (nextNumber !== adjustment.adjustmentNumber) {
          const existing = await manager
            .getRepository(StockAdjustment)
            .findOne({
              where: { adjustmentNumber: nextNumber, deletedAt: IsNull() },
            });
          if (existing) {
            throw new BadRequestException(
              `Adjustment number ${nextNumber} already exists`,
            );
          }
          adjustment.adjustmentNumber = nextNumber;
        }
      }

      if (dto.adjustmentDate) {
        adjustment.adjustmentDate = new Date(dto.adjustmentDate);
      }

      if (dto.notes !== undefined) {
        adjustment.notes = dto.notes?.trim() || null;
      }

      adjustment.warehouseId = warehouseId;

      await manager.getRepository(StockAdjustment).save(adjustment);

      if (dto.items) {
        const resolvedItems = await this.resolveItems(
          manager,
          scopedBusinessId,
          warehouseId,
          dto.items,
          false,
        );

        await manager.getRepository(StockAdjustmentItem).delete({
          stockAdjustmentId: adjustment.id,
        });

        const itemEntities = resolvedItems.map((line) =>
          manager.getRepository(StockAdjustmentItem).create({
            stockAdjustmentId: adjustment.id,
            productId: line.productId,
            productFlavourId: line.productFlavourId,
            uomId: line.uomId,
            direction: line.direction,
            quantity: line.quantity,
            purchaseUnitPrice: line.purchaseUnitPrice,
            saleUnitPrice: line.saleUnitPrice,
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate,
            reason: line.reason,
          }),
        );
        await manager.getRepository(StockAdjustmentItem).save(itemEntities);
      }

      return this.findAdjustmentForBusiness(
        manager,
        scopedBusinessId,
        adjustment.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_ADJUSTMENT_UPDATED',
      description: `Stock adjustment ${updated.adjustmentNumber} updated`,
      metadata: { stockAdjustmentId: updated.id },
    });

    return { data: this.mapAdjustment(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    adjustmentId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const adjustment = await this.findAdjustmentForBusiness(
      tenantDb,
      scopedBusinessId,
      adjustmentId,
      false,
    );
    this.assertPendingStatus(adjustment);

    await tenantDb.getRepository(StockAdjustment).softDelete(adjustment.id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_ADJUSTMENT_DELETED',
      description: `Stock adjustment ${adjustment.adjustmentNumber} deleted`,
      metadata: { stockAdjustmentId: adjustment.id },
    });

    return {
      message: 'Stock adjustment deleted',
      data: {
        id: adjustment.id,
        adjustmentNumber: adjustment.adjustmentNumber,
      },
    };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    adjustmentId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const adjustment = await this.findAdjustmentForBusiness(
      tenantDb,
      scopedBusinessId,
      adjustmentId,
    );

    if (adjustment.status === StockAdjustmentStatus.APPROVED) {
      return {
        message: 'Stock adjustment is already approved',
        data: this.mapAdjustment(adjustment),
      };
    }

    if (adjustment.status !== StockAdjustmentStatus.PENDING) {
      throw new BadRequestException(
        'Only pending stock adjustments can be approved',
      );
    }

    const approved = await tenantDb.transaction(async (manager) => {
      const locked = await this.findAdjustmentForBusiness(
        manager,
        scopedBusinessId,
        adjustmentId,
      );

      if (locked.status === StockAdjustmentStatus.APPROVED) {
        return locked;
      }

      if (locked.status !== StockAdjustmentStatus.PENDING) {
        throw new BadRequestException(
          'Only pending stock adjustments can be approved',
        );
      }

      await this.postStockAdjustment(manager, locked);
      locked.status = StockAdjustmentStatus.APPROVED;
      await manager.getRepository(StockAdjustment).save(locked);

      return this.findAdjustmentForBusiness(
        manager,
        scopedBusinessId,
        locked.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_ADJUSTMENT_APPROVED',
      description: `Stock adjustment ${approved.adjustmentNumber} approved — stock adjusted`,
      metadata: {
        stockAdjustmentId: approved.id,
        warehouseId: approved.warehouseId,
      },
    });

    return { data: this.mapAdjustment(approved) };
  }

  async reject(
    tenantDb: DataSource,
    businessId: string | undefined,
    adjustmentId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const adjustment = await this.findAdjustmentForBusiness(
      tenantDb,
      scopedBusinessId,
      adjustmentId,
      false,
    );
    this.assertPendingStatus(adjustment);

    adjustment.status = StockAdjustmentStatus.REJECTED;
    const rejected = await tenantDb
      .getRepository(StockAdjustment)
      .save(adjustment);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_ADJUSTMENT_REJECTED',
      description: `Stock adjustment ${rejected.adjustmentNumber} rejected`,
      metadata: { stockAdjustmentId: rejected.id },
    });

    return {
      message: 'Stock adjustment rejected',
      data: {
        id: rejected.id,
        adjustmentNumber: rejected.adjustmentNumber,
      },
    };
  }
}
