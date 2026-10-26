import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  StockTransfer,
  StockTransferItem,
  StockTransferStatus,
} from 'src/tenant-db/entities/stock-transfer.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import {
  Product,
  ProductFlavour,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import {
  Batch,
  ReferenceType,
  StockBalance,
} from 'src/tenant-db/entities/stock.entity';
import { CreateStockTransferDto } from '../../dto/stock-transfer/create-stock-transfer.dto';
import { UpdateStockTransferDto } from '../../dto/stock-transfer/update-stock-transfer.dto';
import { CreateStockTransferItemDto } from '../../dto/stock-transfer/create-stock-transfer-item.dto';
import { StockService } from '../stock.service';
import { ActivityLogService } from '../activity-log.service';
import {
  BatchAllocation,
} from '../../utils/stock-batch.util';

const TRANSFER_NUMBER_PREFIX = 'ST';

type ResolvedTransferLine = {
  productId: string;
  productFlavourId: string | null;
  uomId: string;
  quantity: number;
};

@Injectable()
export class StockTransferService {
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

  private assertPendingStatus(transfer: StockTransfer): void {
    if (transfer.status !== StockTransferStatus.PENDING) {
      throw new BadRequestException(
        'Only pending stock transfers can be modified',
      );
    }
  }

  private mapItem(item: StockTransferItem) {
    return {
      id: item.id,
      stockTransferId: item.stockTransferId,
      productId: item.productId,
      productFlavourId: item.productFlavourId,
      uomId: item.uomId,
      quantity: item.quantity,
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

  private mapTransfer(transfer: StockTransfer) {
    return {
      id: transfer.id,
      businessId: transfer.businessId,
      transferNumber: transfer.transferNumber,
      transferDate: transfer.transferDate,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      fromWarehouse: transfer.fromWarehouse
        ? {
            id: transfer.fromWarehouse.id,
            code: transfer.fromWarehouse.code,
            name: transfer.fromWarehouse.name,
          }
        : undefined,
      toWarehouse: transfer.toWarehouse
        ? {
            id: transfer.toWarehouse.id,
            code: transfer.toWarehouse.code,
            name: transfer.toWarehouse.name,
          }
        : undefined,
      notes: transfer.notes,
      createdBy: transfer.createdBy,
      status: transfer.status,
      items: (transfer.items ?? []).map((item) => this.mapItem(item)),
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    };
  }

  private async generateTransferNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(StockTransfer)
      .createQueryBuilder('st')
      .where('st.transferNumber LIKE :prefix', {
        prefix: `${TRANSFER_NUMBER_PREFIX}-%`,
      })
      .orderBy('st.transferNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.transferNumber.replace(
        `${TRANSFER_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${TRANSFER_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertWarehouseForBusiness(
    manager: EntityManager | DataSource,
    businessId: string,
    warehouseId: string,
    label: string,
  ): Promise<Warehouse> {
    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });

    if (!warehouse) {
      throw new NotFoundException(`${label} warehouse ${warehouseId} not found`);
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
        `Insufficient stock for product ${productId} in source warehouse (available: ${available}, requested: ${quantity})`,
      );
    }
  }

  private lineKey(line: {
    productId: string;
    uomId: string;
    productFlavourId?: string | null;
  }): string {
    return `${line.productId}:${line.uomId}:${line.productFlavourId ?? ''}`;
  }

  private async resolveItems(
    manager: EntityManager,
    businessId: string,
    fromWarehouseId: string,
    items: CreateStockTransferItemDto[],
    checkAvailability: boolean,
  ): Promise<ResolvedTransferLine[]> {
    if (!items?.length) {
      throw new BadRequestException('At least one transfer item is required');
    }

    const seen = new Set<string>();
    const resolved: ResolvedTransferLine[] = [];

    for (const item of items) {
      const quantity = this.roundQuantity(item.quantity);
      if (quantity <= 0) {
        throw new BadRequestException('Transfer quantity must be greater than zero');
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
          'Duplicate transfer line for the same product, UOM, and flavour',
        );
      }
      seen.add(key);

      if (checkAvailability) {
        await this.assertStockAvailability(
          manager,
          businessId,
          fromWarehouseId,
          item.productId,
          item.uomId,
          quantity,
        );
      }

      resolved.push({
        productId: item.productId,
        productFlavourId: item.productFlavourId ?? null,
        uomId: item.uomId,
        quantity,
      });
    }

    return resolved;
  }

  private async findTransferForBusiness(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    transferId: string,
    withRelations = true,
  ): Promise<StockTransfer> {
    const qb = tenantDb
      .getRepository(StockTransfer)
      .createQueryBuilder('st')
      .where('st.id = :transferId', { transferId })
      .andWhere('st.businessId = :businessId', { businessId })
      .andWhere('st.deletedAt IS NULL');

    if (withRelations) {
      qb.leftJoinAndSelect('st.items', 'items')
        .leftJoinAndSelect('items.product', 'product')
        .leftJoinAndSelect('items.productFlavour', 'productFlavour')
        .leftJoinAndSelect('items.uom', 'uom')
        .leftJoinAndSelect('st.fromWarehouse', 'fromWarehouse')
        .leftJoinAndSelect('st.toWarehouse', 'toWarehouse');
    }

    const transfer = await qb.getOne();
    if (!transfer) {
      throw new NotFoundException('Stock transfer not found');
    }

    return transfer;
  }

  private async postStockTransfer(
    manager: EntityManager,
    transfer: StockTransfer,
  ): Promise<void> {
    const items = transfer.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Stock transfer must have at least one item to approve',
      );
    }

    for (const item of items) {
      await this.assertStockAvailability(
        manager,
        transfer.businessId,
        transfer.fromWarehouseId,
        item.productId,
        item.uomId,
        item.quantity,
      );
    }

    const outResults = await this.stockService.consumeStockOut(manager, {
      businessId: transfer.businessId,
      warehouseId: transfer.fromWarehouseId,
      referenceType: ReferenceType.TRANSFER,
      lines: items.map((item) => ({
        productId: item.productId,
        uomId: item.uomId,
        quantity: item.quantity,
      })),
    });

    const allAllocations: BatchAllocation[] = outResults.flatMap(
      (row) => row.batchAllocations,
    );

    if (!allAllocations.length) {
      throw new BadRequestException('No batch allocations found for transfer');
    }

    const batchIds = [...new Set(allAllocations.map((row) => row.batchId))];
    const batches = await manager.getRepository(Batch).find({
      where: { id: In(batchIds), deletedAt: IsNull() },
    });
    const batchMap = new Map(batches.map((batch) => [batch.id, batch]));

    const receiveByVendor = new Map<
      string,
      Array<{
        productId: string;
        uomId: string;
        quantity: number;
        purchaseUnitPrice: number;
        saleUnitPrice: number;
        expiryDate: Date | null;
      }>
    >();

    for (const allocation of allAllocations) {
      const batch = batchMap.get(allocation.batchId);
      if (!batch) {
        throw new BadRequestException(
          `Source batch ${allocation.batchId} not found for transfer`,
        );
      }

      const lines = receiveByVendor.get(batch.vendorId) ?? [];
      lines.push({
        productId: batch.productId,
        uomId: batch.uomId,
        quantity: allocation.quantity,
        purchaseUnitPrice: Number(batch.purchaseUnitPrice),
        saleUnitPrice: Number(batch.saleUnitPrice),
        expiryDate: batch.expiryDate ?? null,
      });
      receiveByVendor.set(batch.vendorId, lines);
    }

    const transferDate = new Date(transfer.transferDate);
    const prefix = `TRF-${transfer.transferNumber}`;

    for (const [vendorId, lines] of receiveByVendor.entries()) {
      await this.stockService.receiveStockIn(manager, {
        businessId: transfer.businessId,
        warehouseId: transfer.toWarehouseId,
        vendorId,
        referenceType: ReferenceType.TRANSFER,
        batchDate: transferDate,
        batchNumberPrefix: prefix,
        lines,
      });
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateStockTransferDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(
        'Source and destination warehouses must be different',
      );
    }

    const targetStatus = dto.status ?? StockTransferStatus.PENDING;
    const approveOnCreate = targetStatus === StockTransferStatus.APPROVED;

    const created = await tenantDb.transaction(async (manager) => {
      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        dto.fromWarehouseId,
        'Source',
      );
      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        dto.toWarehouseId,
        'Destination',
      );

      const resolvedItems = await this.resolveItems(
        manager,
        scopedBusinessId,
        dto.fromWarehouseId,
        dto.items,
        approveOnCreate,
      );

      const transferNumber =
        dto.transferNumber?.trim() ||
        (await this.generateTransferNumber(manager));

      const existing = await manager.getRepository(StockTransfer).findOne({
        where: { transferNumber, deletedAt: IsNull() },
      });
      if (existing) {
        throw new BadRequestException(
          `Transfer number ${transferNumber} already exists`,
        );
      }

      const transfer = manager.getRepository(StockTransfer).create({
        businessId: scopedBusinessId,
        transferNumber,
        transferDate: new Date(dto.transferDate),
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        notes: dto.notes?.trim() || null,
        createdBy: actorUserId,
        status: StockTransferStatus.PENDING,
      });

      const saved = await manager.getRepository(StockTransfer).save(transfer);

      const itemEntities = resolvedItems.map((line) =>
        manager.getRepository(StockTransferItem).create({
          stockTransferId: saved.id,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          quantity: line.quantity,
        }),
      );
      await manager.getRepository(StockTransferItem).save(itemEntities);

      const withItems = await this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        saved.id,
      );

      if (approveOnCreate) {
        await this.postStockTransfer(manager, withItems);
        withItems.status = StockTransferStatus.APPROVED;
        await manager.getRepository(StockTransfer).save(withItems);
      }

      return this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        saved.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: approveOnCreate
        ? 'STOCK_TRANSFER_CREATED_AND_APPROVED'
        : 'STOCK_TRANSFER_CREATED',
      description: approveOnCreate
        ? `Stock transfer ${created.transferNumber} created and approved`
        : `Stock transfer ${created.transferNumber} created`,
      metadata: {
        stockTransferId: created.id,
        fromWarehouseId: created.fromWarehouseId,
        toWarehouseId: created.toWarehouseId,
      },
    });

    return { data: this.mapTransfer(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      fromWarehouseId?: string;
      toWarehouseId?: string;
      status?: StockTransferStatus;
    },
    _actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, Math.min(100, options.limit));
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(StockTransfer)
      .createQueryBuilder('st')
      .leftJoinAndSelect('st.fromWarehouse', 'fromWarehouse')
      .leftJoinAndSelect('st.toWarehouse', 'toWarehouse')
      .leftJoinAndSelect('st.items', 'items')
      .where('st.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('st.deletedAt IS NULL');

    if (options.fromWarehouseId) {
      qb.andWhere('st.fromWarehouseId = :fromWarehouseId', {
        fromWarehouseId: options.fromWarehouseId,
      });
    }

    if (options.toWarehouseId) {
      qb.andWhere('st.toWarehouseId = :toWarehouseId', {
        toWarehouseId: options.toWarehouseId,
      });
    }

    if (options.status) {
      qb.andWhere('st.status = :status', { status: options.status });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('st.transferNumber ILIKE :search', { search })
            .orWhere('st.notes ILIKE :search', { search })
            .orWhere('fromWarehouse.name ILIKE :search', { search })
            .orWhere('fromWarehouse.code ILIKE :search', { search })
            .orWhere('toWarehouse.name ILIKE :search', { search })
            .orWhere('toWarehouse.code ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy('st.transferDate', 'DESC')
      .addOrderBy('st.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.mapTransfer(row)),
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
    transferId: string,
    _actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const transfer = await this.findTransferForBusiness(
      tenantDb,
      scopedBusinessId,
      transferId,
    );
    return { data: this.mapTransfer(transfer) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    transferId: string,
    dto: UpdateStockTransferDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const transfer = await this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        transferId,
      );
      this.assertPendingStatus(transfer);

      const fromWarehouseId =
        dto.fromWarehouseId ?? transfer.fromWarehouseId;
      const toWarehouseId = dto.toWarehouseId ?? transfer.toWarehouseId;

      if (fromWarehouseId === toWarehouseId) {
        throw new BadRequestException(
          'Source and destination warehouses must be different',
        );
      }

      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        fromWarehouseId,
        'Source',
      );
      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        toWarehouseId,
        'Destination',
      );

      if (dto.transferNumber?.trim()) {
        const nextNumber = dto.transferNumber.trim();
        if (nextNumber !== transfer.transferNumber) {
          const existing = await manager.getRepository(StockTransfer).findOne({
            where: { transferNumber: nextNumber, deletedAt: IsNull() },
          });
          if (existing) {
            throw new BadRequestException(
              `Transfer number ${nextNumber} already exists`,
            );
          }
          transfer.transferNumber = nextNumber;
        }
      }

      if (dto.transferDate) {
        transfer.transferDate = new Date(dto.transferDate);
      }

      if (dto.notes !== undefined) {
        transfer.notes = dto.notes?.trim() || null;
      }

      transfer.fromWarehouseId = fromWarehouseId;
      transfer.toWarehouseId = toWarehouseId;

      await manager.getRepository(StockTransfer).save(transfer);

      if (dto.items) {
        const resolvedItems = await this.resolveItems(
          manager,
          scopedBusinessId,
          fromWarehouseId,
          dto.items,
          false,
        );

        await manager.getRepository(StockTransferItem).delete({
          stockTransferId: transfer.id,
        });

        const itemEntities = resolvedItems.map((line) =>
          manager.getRepository(StockTransferItem).create({
            stockTransferId: transfer.id,
            productId: line.productId,
            productFlavourId: line.productFlavourId,
            uomId: line.uomId,
            quantity: line.quantity,
          }),
        );
        await manager.getRepository(StockTransferItem).save(itemEntities);
      }

      return this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        transfer.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_UPDATED',
      description: `Stock transfer ${updated.transferNumber} updated`,
      metadata: { stockTransferId: updated.id },
    });

    return { data: this.mapTransfer(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    transferId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const transfer = await this.findTransferForBusiness(
      tenantDb,
      scopedBusinessId,
      transferId,
      false,
    );
    this.assertPendingStatus(transfer);

    await tenantDb.getRepository(StockTransfer).softDelete(transfer.id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_DELETED',
      description: `Stock transfer ${transfer.transferNumber} deleted`,
      metadata: { stockTransferId: transfer.id },
    });

    return {
      message: 'Stock transfer deleted',
      data: { id: transfer.id, transferNumber: transfer.transferNumber },
    };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    transferId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const transfer = await this.findTransferForBusiness(
      tenantDb,
      scopedBusinessId,
      transferId,
    );

    if (transfer.status === StockTransferStatus.APPROVED) {
      return {
        message: 'Stock transfer is already approved',
        data: this.mapTransfer(transfer),
      };
    }

    if (transfer.status !== StockTransferStatus.PENDING) {
      throw new BadRequestException('Only pending stock transfers can be approved');
    }

    const approved = await tenantDb.transaction(async (manager) => {
      const locked = await this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        transferId,
      );

      if (locked.status === StockTransferStatus.APPROVED) {
        return locked;
      }

      if (locked.status !== StockTransferStatus.PENDING) {
        throw new BadRequestException(
          'Only pending stock transfers can be approved',
        );
      }

      await this.postStockTransfer(manager, locked);
      locked.status = StockTransferStatus.APPROVED;
      await manager.getRepository(StockTransfer).save(locked);

      return this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        locked.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_APPROVED',
      description: `Stock transfer ${approved.transferNumber} approved — stock moved`,
      metadata: {
        stockTransferId: approved.id,
        fromWarehouseId: approved.fromWarehouseId,
        toWarehouseId: approved.toWarehouseId,
      },
    });

    return { data: this.mapTransfer(approved) };
  }

  async reject(
    tenantDb: DataSource,
    businessId: string | undefined,
    transferId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const transfer = await this.findTransferForBusiness(
      tenantDb,
      scopedBusinessId,
      transferId,
      false,
    );
    this.assertPendingStatus(transfer);

    transfer.status = StockTransferStatus.REJECTED;
    const rejected = await tenantDb.getRepository(StockTransfer).save(transfer);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_REJECTED',
      description: `Stock transfer ${rejected.transferNumber} rejected`,
      metadata: { stockTransferId: rejected.id },
    });

    return {
      message: 'Stock transfer rejected',
      data: { id: rejected.id, transferNumber: rejected.transferNumber },
    };
  }
}
