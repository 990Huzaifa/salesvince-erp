import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
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
  ProductPricing,
  ProductPricingType,
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
import {
  StockTransferJsonImportDto,
  StockTransferJsonItemDto,
} from '../../dto/stock-transfer/stock-transfer-json-export-import.dto';
import {
  JsonExportEntity,
  JsonImportMode,
  JsonImportResult,
  JsonImportResultRow,
  SALESVINCE_EXPORT_FORMAT,
} from '../../dto/import-export/json-export-envelope.dto';
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
      {
        vendorId: string | null;
        lines: Array<{
          productId: string;
          uomId: string;
          quantity: number;
          purchaseUnitPrice: number;
          saleUnitPrice: number;
          expiryDate: Date | null;
        }>;
      }
    >();

    for (const allocation of allAllocations) {
      const batch = batchMap.get(allocation.batchId);
      if (!batch) {
        throw new BadRequestException(
          `Source batch ${allocation.batchId} not found for transfer`,
        );
      }

      const vendorKey = batch.vendorId ?? '__none__';
      const group = receiveByVendor.get(vendorKey) ?? {
        vendorId: batch.vendorId ?? null,
        lines: [],
      };
      group.lines.push({
        productId: batch.productId,
        uomId: batch.uomId,
        quantity: allocation.quantity,
        purchaseUnitPrice: Number(batch.purchaseUnitPrice),
        saleUnitPrice: Number(batch.saleUnitPrice),
        expiryDate: batch.expiryDate ?? null,
      });
      receiveByVendor.set(vendorKey, group);
    }

    const transferDate = new Date(transfer.transferDate);
    const prefix = `TRF-${transfer.transferNumber}`;

    for (const group of receiveByVendor.values()) {
      await this.stockService.receiveStockIn(manager, {
        businessId: transfer.businessId,
        warehouseId: transfer.toWarehouseId,
        vendorId: group.vendorId,
        referenceType: ReferenceType.TRANSFER,
        batchDate: transferDate,
        batchNumberPrefix: prefix,
        lines: group.lines,
      });
    }
  }

  /**
   * Recovery-only stock post: IN on destination warehouse only.
   * Does not consume / OUT from source warehouse (no minus).
   */
  private async postStockTransferToOnly(
    manager: EntityManager,
    transfer: StockTransfer,
  ): Promise<void> {
    const items = transfer.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Stock transfer must have at least one item to approve',
      );
    }

    const transferDate = new Date(transfer.transferDate);
    const prefix = `TRF-RCV-${transfer.transferNumber}`;

    const lines: Array<{
      productId: string;
      uomId: string;
      quantity: number;
      purchaseUnitPrice: number;
      saleUnitPrice: number;
      expiryDate: Date | null;
    }> = [];

    for (const item of items) {
      const prices = await this.resolveLinePricesForToOnly(
        manager,
        item.productId,
        item.uomId,
      );
      lines.push({
        productId: item.productId,
        uomId: item.uomId,
        quantity: item.quantity,
        purchaseUnitPrice: prices.purchaseUnitPrice,
        saleUnitPrice: prices.saleUnitPrice,
        expiryDate: null,
      });
    }

    await this.stockService.receiveStockIn(manager, {
      businessId: transfer.businessId,
      warehouseId: transfer.toWarehouseId,
      vendorId: null,
      referenceType: ReferenceType.TRANSFER,
      batchDate: transferDate,
      batchNumberPrefix: prefix,
      lines,
    });
  }

  private async resolveLinePricesForToOnly(
    manager: EntityManager,
    productId: string,
    uomId: string,
  ): Promise<{ purchaseUnitPrice: number; saleUnitPrice: number }> {
    const pricing = await manager.getRepository(ProductPricing).findOne({
      where: { productId, uomId },
      order: { createdAt: 'DESC' },
    });

    if (!pricing) {
      return { purchaseUnitPrice: 0, saleUnitPrice: 0 };
    }

    const purchaseUnitPrice = Number(pricing.purchaseUnitPrice) || 0;
    const pricingType = pricing.pricingType ?? ProductPricingType.BY_AMOUNT;

    if (pricingType === ProductPricingType.BY_MARGIN) {
      const salePercentage = Number(pricing.salePercentage ?? 0);
      return {
        purchaseUnitPrice,
        saleUnitPrice: purchaseUnitPrice * (1 + salePercentage / 100),
      };
    }

    return {
      purchaseUnitPrice,
      saleUnitPrice:
        purchaseUnitPrice + Number(pricing.saleUnitMarginAmount ?? 0),
    };
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

  private toJsonNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private formatDateForJson(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toISOString().slice(0, 10);
  }

  private mapTransferToJsonItem(transfer: StockTransfer): StockTransferJsonItemDto {
    return {
      transferNumber: transfer.transferNumber,
      transferDate: this.formatDateForJson(transfer.transferDate),
      fromWarehouseCode: transfer.fromWarehouse?.code ?? '',
      toWarehouseCode: transfer.toWarehouse?.code ?? '',
      notes: transfer.notes ?? null,
      items: (transfer.items ?? []).map((item) => ({
        skuCode: item.product?.skuCode ?? '',
        uomName: item.uom?.name ?? '',
        productFlavourName: item.productFlavour?.flavour?.name ?? null,
        quantity: this.toJsonNumber(item.quantity),
      })),
    };
  }

  private parseIdList(ids?: string | string[]): string[] {
    if (!ids) {
      return [];
    }
    const raw = Array.isArray(ids) ? ids : ids.split(',');
    return [
      ...new Set(
        raw
          .map((id) => id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private async findWarehouseByCode(
    tenantDb: DataSource,
    businessId: string,
    warehouseCode: string,
    options?: { includeDeleted?: boolean },
  ): Promise<Warehouse | null> {
    const qb = tenantDb
      .getRepository(Warehouse)
      .createQueryBuilder('w')
      .select(['w.id', 'w.code', 'w.name'])
      .where('w.businessId = :businessId', { businessId })
      .andWhere('w.code = :warehouseCode', { warehouseCode });

    if (options?.includeDeleted) {
      qb.withDeleted();
    } else {
      qb.andWhere('w.deletedAt IS NULL');
    }

    return qb.getOne();
  }

  private async findProductBySkuCode(
    tenantDb: DataSource,
    businessId: string,
    skuCode: string,
  ): Promise<Product | null> {
    return tenantDb.getRepository(Product).findOne({
      where: { businessId, skuCode, isDelete: false },
      select: ['id', 'skuCode', 'name'],
    });
  }

  private async findUomByNameForBusiness(
    tenantDb: DataSource,
    businessId: string,
    uomName: string,
  ): Promise<Uom | null> {
    return tenantDb.getRepository(Uom).findOne({
      where: { businessId, name: uomName },
      select: ['id', 'name'],
    });
  }

  private async findProductFlavourByName(
    tenantDb: DataSource,
    productId: string,
    flavourName: string,
  ): Promise<ProductFlavour | null> {
    return tenantDb
      .getRepository(ProductFlavour)
      .createQueryBuilder('pf')
      .innerJoinAndSelect('pf.flavour', 'flavour')
      .where('pf.productId = :productId', { productId })
      .andWhere('flavour.name = :flavourName', { flavourName })
      .getOne();
  }

  async exportStockTransfersJson(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
    options?: {
      ids?: string | string[];
      warehouseCode?: string;
    },
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const ids = this.parseIdList(options?.ids);
    const warehouseCode = options?.warehouseCode?.trim() || undefined;
    let warehouseId: string | undefined;

    if (warehouseCode) {
      const warehouse = await this.findWarehouseByCode(
        tenantDb,
        scopedBusinessId,
        warehouseCode,
      );
      if (!warehouse) {
        throw new NotFoundException(
          `Warehouse with code "${warehouseCode}" not found`,
        );
      }
      warehouseId = warehouse.id;
    }

    const qb = tenantDb
      .getRepository(StockTransfer)
      .createQueryBuilder('st')
      .leftJoinAndSelect('st.fromWarehouse', 'fromWarehouse')
      .leftJoinAndSelect('st.toWarehouse', 'toWarehouse')
      .leftJoinAndSelect('st.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .where('st.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('st.deletedAt IS NULL');

    if (ids.length) {
      qb.andWhere('st.id IN (:...ids)', { ids });
    }

    if (warehouseId) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('st.fromWarehouseId = :warehouseId', { warehouseId })
            .orWhere('st.toWarehouseId = :warehouseId', { warehouseId });
        }),
      );
    }

    const transfers = await qb
      .orderBy('st.transferNumber', 'ASC')
      .addOrderBy('items.createdAt', 'ASC')
      .getMany();

    const items = transfers.map((row) => this.mapTransferToJsonItem(row));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_JSON_EXPORTED',
      description: 'Stock transfers exported as JSON',
      metadata: {
        businessId: scopedBusinessId,
        count: items.length,
        warehouseCode: warehouseCode ?? null,
        ids: ids.length ? ids : null,
      },
    });

    return {
      format: SALESVINCE_EXPORT_FORMAT,
      version: 1,
      entity: JsonExportEntity.STOCK_TRANSFERS,
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

  private parseStockTransferJsonImportFile(
    file: Express.Multer.File,
  ): StockTransferJsonImportDto {
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
      StockTransferJsonImportDto,
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
          'Invalid stock transfer JSON import payload',
      );
    }

    if (dto.entity && dto.entity !== JsonExportEntity.STOCK_TRANSFERS) {
      throw new BadRequestException(
        'entity must be "stockTransfers" for stock transfer JSON import',
      );
    }

    return dto;
  }

  private async buildCreateDtoFromJsonItem(
    tenantDb: DataSource,
    businessId: string,
    item: StockTransferJsonItemDto,
    options?: { allowDeletedFromWarehouse?: boolean },
  ): Promise<CreateStockTransferDto> {
    const fromCode = item.fromWarehouseCode.trim();
    const toCode = item.toWarehouseCode.trim();

    const fromWarehouse = await this.findWarehouseByCode(
      tenantDb,
      businessId,
      fromCode,
      { includeDeleted: options?.allowDeletedFromWarehouse === true },
    );
    if (!fromWarehouse) {
      throw new NotFoundException(
        `Source warehouse code ${fromCode} not found`,
      );
    }

    const toWarehouse = await this.findWarehouseByCode(
      tenantDb,
      businessId,
      toCode,
    );
    if (!toWarehouse) {
      throw new NotFoundException(
        `Destination warehouse code ${toCode} not found`,
      );
    }

    if (fromWarehouse.id === toWarehouse.id) {
      throw new BadRequestException(
        'Source and destination warehouses must be different',
      );
    }

    const lineItems: CreateStockTransferItemDto[] = [];
    for (const [lineIndex, line] of item.items.entries()) {
      const skuCode = line.skuCode.trim();
      const uomName = line.uomName.trim();
      const product = await this.findProductBySkuCode(
        tenantDb,
        businessId,
        skuCode,
      );
      if (!product) {
        throw new NotFoundException(
          `Line ${lineIndex + 1}: product SKU ${skuCode} not found`,
        );
      }

      const uom = await this.findUomByNameForBusiness(
        tenantDb,
        businessId,
        uomName,
      );
      if (!uom) {
        throw new NotFoundException(
          `Line ${lineIndex + 1}: UOM ${uomName} not found`,
        );
      }

      let productFlavourId: string | undefined;
      const flavourName = line.productFlavourName?.trim();
      if (flavourName) {
        const flavour = await this.findProductFlavourByName(
          tenantDb,
          product.id,
          flavourName,
        );
        if (!flavour) {
          throw new NotFoundException(
            `Line ${lineIndex + 1}: flavour ${flavourName} not found for product ${skuCode}`,
          );
        }
        productFlavourId = flavour.id;
      }

      lineItems.push({
        productId: product.id,
        uomId: uom.id,
        productFlavourId,
        quantity: line.quantity,
      });
    }

    return {
      fromWarehouseId: fromWarehouse.id,
      toWarehouseId: toWarehouse.id,
      transferNumber: item.transferNumber?.trim() || undefined,
      transferDate: item.transferDate,
      notes: item.notes ?? undefined,
      status: StockTransferStatus.PENDING,
      items: lineItems,
    };
  }

  async importStockTransfersJson(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
  ): Promise<JsonImportResult> {
    const scopedBusinessId = this.assertBusinessId(user.businessId);
    const dto = this.parseStockTransferJsonImportFile(file);

    const results: JsonImportResultRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, item] of dto.items.entries()) {
      const key = item.transferNumber?.trim() || `row-${index + 1}`;
      try {
        const transferNumber = item.transferNumber?.trim();
        if (transferNumber) {
          const existing = await tenantDb.getRepository(StockTransfer).findOne({
            where: { transferNumber, deletedAt: IsNull() },
            select: ['id', 'transferNumber'],
          });
          if (existing) {
            skipped += 1;
            results.push({
              index: index + 1,
              key,
              status: 'skipped',
              message: `Transfer number ${transferNumber} already exists`,
              id: existing.id,
            });
            continue;
          }
        }

        const createDto = await this.buildCreateDtoFromJsonItem(
          tenantDb,
          scopedBusinessId,
          item,
        );
        const saved = await this.create(
          tenantDb,
          scopedBusinessId,
          createDto,
          user.userId,
        );

        created += 1;
        results.push({
          index: index + 1,
          key,
          status: 'created',
          id: saved.data.id,
          message: `Created as PENDING (${saved.data.transferNumber})`,
        });
      } catch (error) {
        failed += 1;
        results.push({
          index: index + 1,
          key,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_JSON_IMPORTED',
      description: `Stock transfer JSON import completed (${created} created, ${skipped} skipped, ${failed} failed)`,
      metadata: {
        businessId: scopedBusinessId,
        total: dto.items.length,
        created,
        skipped,
        failed,
        mode: JsonImportMode.CREATE_ONLY,
      },
    });

    return {
      entity: JsonExportEntity.STOCK_TRANSFERS,
      total: dto.items.length,
      created,
      updated: 0,
      skipped,
      failed,
      results,
    };
  }

  /**
   * Recovery coverup: create transfer as APPROVED and post stock IN on
   * destination warehouse only (no OUT / minus on source).
   */
  async createApprovedToOnly(
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

    const created = await tenantDb.transaction(async (manager) => {
      const fromWarehouse = await manager.getRepository(Warehouse).findOne({
        where: { id: dto.fromWarehouseId, businessId: scopedBusinessId },
        withDeleted: true,
      });
      if (!fromWarehouse) {
        throw new NotFoundException(
          `Source warehouse ${dto.fromWarehouseId} not found`,
        );
      }

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
        false,
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

      await this.postStockTransferToOnly(manager, withItems);
      withItems.status = StockTransferStatus.APPROVED;
      await manager.getRepository(StockTransfer).save(withItems);

      return this.findTransferForBusiness(
        manager,
        scopedBusinessId,
        saved.id,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_IMPORTED_TO_ONLY',
      description: `Stock transfer ${created.transferNumber} imported APPROVED — TO warehouse IN only (no FROM minus)`,
      metadata: {
        stockTransferId: created.id,
        fromWarehouseId: created.fromWarehouseId,
        toWarehouseId: created.toWarehouseId,
        mode: 'to_only',
      },
    });

    return { data: this.mapTransfer(created) };
  }

  /**
   * Recovery JSON import: same envelope as export, creates APPROVED transfers
   * and posts stock only to destination warehouse (no source OUT).
   */
  async importStockTransfersJsonToOnly(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
  ): Promise<JsonImportResult> {
    const scopedBusinessId = this.assertBusinessId(user.businessId);
    const dto = this.parseStockTransferJsonImportFile(file);

    const results: JsonImportResultRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const [index, item] of dto.items.entries()) {
      const key = item.transferNumber?.trim() || `row-${index + 1}`;
      try {
        const transferNumber = item.transferNumber?.trim();
        if (transferNumber) {
          const existing = await tenantDb.getRepository(StockTransfer).findOne({
            where: { transferNumber, deletedAt: IsNull() },
            select: ['id', 'transferNumber'],
          });
          if (existing) {
            skipped += 1;
            results.push({
              index: index + 1,
              key,
              status: 'skipped',
              message: `Transfer number ${transferNumber} already exists`,
              id: existing.id,
            });
            continue;
          }
        }

        const createDto = await this.buildCreateDtoFromJsonItem(
          tenantDb,
          scopedBusinessId,
          item,
          { allowDeletedFromWarehouse: true },
        );
        const saved = await this.createApprovedToOnly(
          tenantDb,
          scopedBusinessId,
          createDto,
          user.userId,
        );

        created += 1;
        results.push({
          index: index + 1,
          key,
          status: 'created',
          id: saved.data.id,
          message: `Created as APPROVED (TO-only IN) (${saved.data.transferNumber})`,
        });
      } catch (error) {
        failed += 1;
        results.push({
          index: index + 1,
          key,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: scopedBusinessId,
      action: 'STOCK_TRANSFER_JSON_IMPORTED_TO_ONLY',
      description: `Stock transfer JSON TO-only import completed (${created} created, ${skipped} skipped, ${failed} failed)`,
      metadata: {
        businessId: scopedBusinessId,
        total: dto.items.length,
        created,
        skipped,
        failed,
        mode: 'to_only_approved',
      },
    });

    return {
      entity: JsonExportEntity.STOCK_TRANSFERS,
      total: dto.items.length,
      created,
      updated: 0,
      skipped,
      failed,
      results,
    };
  }
}
