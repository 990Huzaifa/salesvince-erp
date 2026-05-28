import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { Product } from 'src/tenant-db/entities/product.entity';
import {
  Batch,
  ReferenceType,
  StockBalance,
  StockMovement,
  StockMovementType,
} from 'src/tenant-db/entities/stock.entity';
import {
  allocateFromBatches,
  BatchAllocation,
  groupAllocationsByWarehouse,
} from '../utils/stock-batch.util';

export type ReceiveStockLineInput = {
  productId: string;
  uomId: string;
  quantity: number;
  purchaseUnitPrice: number;
  saleUnitMarginAmount: number;
  saleUnitMarginPercentage: number;
  expiryDate?: Date | null;
  batchNumber?: string;
};

export type ReceiveStockInput = {
  businessId: string;
  warehouseId: string;
  vendorId: string;
  referenceType: ReferenceType;
  batchDate: Date;
  batchNumberPrefix: string;
  lines: ReceiveStockLineInput[];
};

export type ReceiveStockLineResult = {
  batch: Batch;
  stockBalance: StockBalance;
  movement: StockMovement;
};

export type ConsumeStockLineInput = {
  productId: string;
  uomId: string;
  quantity: number;
};

export type ConsumeStockInput = {
  businessId: string;
  warehouseId: string;
  referenceType: ReferenceType;
  lines: ConsumeStockLineInput[];
};

export type ConsumeReservedStockInput = {
  businessId: string;
  referenceType: ReferenceType;
  lines: ConsumeStockLineInput[];
};

export type ConsumeStockLineResult = {
  stockBalance: StockBalance;
  movement: StockMovement;
  batchAllocations: BatchAllocation[];
};

export type ConsumeReservedStockLineResult = {
  productId: string;
  uomId: string;
  quantity: number;
  batchAllocations: BatchAllocation[];
  stockBalances: StockBalance[];
  movements: StockMovement[];
};

export type ReserveStockInput = {
  businessId: string;
  lines: ConsumeStockLineInput[];
};

export type ReserveStockLineResult = {
  productId: string;
  uomId: string;
  quantity: number;
  batchAllocations: BatchAllocation[];
  stockBalances: StockBalance[];
};

@Injectable()
export class StockService {
  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private async generateBatchNumber(
    manager: EntityManager,
    prefix: string,
    productId: string,
    uomId: string,
  ): Promise<string> {
    const base = `${prefix}-${productId.slice(0, 8)}-${uomId.slice(0, 8)}`;
    const last = await manager
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .where('batch.batchNumber LIKE :pattern', { pattern: `${base}-%` })
      .orderBy('batch.batchNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.batchNumber.replace(`${base}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${base}-${String(next).padStart(4, '0')}`;
  }

  private async upsertStockBalance(
    manager: EntityManager,
    params: {
      businessId: string;
      warehouseId: string;
      productId: string;
      uomId: string;
      quantityDelta: number;
    },
  ): Promise<StockBalance> {
    const balanceRepo = manager.getRepository(StockBalance);
    const rows = (await manager.query(
      `
        INSERT INTO "stock_balances" (
          "businessId",
          "warehouseId",
          "productId",
          "uomId",
          "quantityAvailable",
          "quantityOnHand",
          "quantityReserved",
          "quantityDamaged"
        )
        VALUES ($1, $2, $3, $4, $5, $5, 0, 0)
        ON CONFLICT ("businessId", "warehouseId", "productId", "uomId")
        WHERE "deletedAt" IS NULL
        DO UPDATE SET
          "quantityAvailable" = "stock_balances"."quantityAvailable" + EXCLUDED."quantityAvailable",
          "quantityOnHand" = "stock_balances"."quantityOnHand" + EXCLUDED."quantityOnHand",
          "updatedAt" = now()
        RETURNING *
      `,
      [
        params.businessId,
        params.warehouseId,
        params.productId,
        params.uomId,
        params.quantityDelta,
      ],
    )) as StockBalance[];
    const stockBalance = balanceRepo.create(rows[0] as Partial<StockBalance>);

    if (stockBalance.quantityOnHand < 0 || stockBalance.quantityAvailable < 0) {
      throw new BadRequestException('Insufficient stock for this operation');
    }

    return stockBalance;
  }

  private async updateReservedStockBalance(
    manager: EntityManager,
    params: {
      businessId: string;
      warehouseId: string;
      productId: string;
      uomId: string;
      availableDelta: number;
      onHandDelta: number;
      reservedDelta: number;
    },
  ): Promise<StockBalance> {
    const balanceRepo = manager.getRepository(StockBalance);
    const rows = (await manager.query(
      `
        UPDATE "stock_balances"
        SET
          "quantityAvailable" = "quantityAvailable" + $5,
          "quantityOnHand" = "quantityOnHand" + $6,
          "quantityReserved" = "quantityReserved" + $7,
          "updatedAt" = now()
        WHERE "businessId" = $1
          AND "warehouseId" = $2
          AND "productId" = $3
          AND "uomId" = $4
          AND "deletedAt" IS NULL
        RETURNING *
      `,
      [
        params.businessId,
        params.warehouseId,
        params.productId,
        params.uomId,
        params.availableDelta,
        params.onHandDelta,
        params.reservedDelta,
      ],
    )) as StockBalance[];

    if (!rows.length) {
      throw new BadRequestException('Insufficient stock for this operation');
    }

    const stockBalance = balanceRepo.create(rows[0] as Partial<StockBalance>);

    if (
      stockBalance.quantityOnHand < 0 ||
      stockBalance.quantityAvailable < 0 ||
      stockBalance.quantityReserved < 0
    ) {
      throw new BadRequestException('Insufficient stock for this operation');
    }

    return stockBalance;
  }

  private async loadProductForBusiness(
    manager: EntityManager,
    businessId: string,
    productId: string,
  ): Promise<Product> {
    const product = await manager.getRepository(Product).findOne({
      where: { id: productId, businessId, isDelete: false },
    });

    if (!product) {
      throw new BadRequestException(`Product ${productId} not found`);
    }

    return product;
  }

  private async loadAvailableBatches(
    manager: EntityManager,
    params: {
      businessId: string;
      productId: string;
      uomId: string;
      warehouseId?: string;
    },
  ): Promise<Batch[]> {
    const qb = manager
      .getRepository(Batch)
      .createQueryBuilder('batch')
      .where('batch.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('batch.productId = :productId', { productId: params.productId })
      .andWhere('batch.uomId = :uomId', { uomId: params.uomId })
      .andWhere('batch.deletedAt IS NULL')
      .andWhere('batch.quantity > 0');

    if (params.warehouseId) {
      qb.andWhere('batch.warehouseId = :warehouseId', {
        warehouseId: params.warehouseId,
      });
    }

    return qb.getMany();
  }

  private async getTotalAvailableQuantity(
    manager: EntityManager,
    params: {
      businessId: string;
      productId: string;
      uomId: string;
      warehouseId?: string;
    },
  ): Promise<number> {
    const qb = manager
      .getRepository(StockBalance)
      .createQueryBuilder('balance')
      .select('COALESCE(SUM(balance.quantityAvailable), 0)', 'total')
      .where('balance.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('balance.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('balance.uomId = :uomId', { uomId: params.uomId })
      .andWhere('balance.deletedAt IS NULL');

    if (params.warehouseId) {
      qb.andWhere('balance.warehouseId = :warehouseId', {
        warehouseId: params.warehouseId,
      });
    }

    const row = await qb.getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async getTotalReservedQuantity(
    manager: EntityManager,
    params: {
      businessId: string;
      productId: string;
      uomId: string;
    },
  ): Promise<number> {
    const row = await manager
      .getRepository(StockBalance)
      .createQueryBuilder('balance')
      .select('COALESCE(SUM(balance.quantityReserved), 0)', 'total')
      .where('balance.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('balance.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('balance.uomId = :uomId', { uomId: params.uomId })
      .andWhere('balance.deletedAt IS NULL')
      .getRawOne<{ total: string }>();

    return Number(row?.total ?? 0);
  }

  private async resolveReservedBatchAllocations(
    manager: EntityManager,
    params: {
      businessId: string;
      productId: string;
      uomId: string;
      quantity: number;
    },
  ): Promise<{ product: Product; allocations: BatchAllocation[] }> {
    const product = await this.loadProductForBusiness(
      manager,
      params.businessId,
      params.productId,
    );

    const totalReserved = await this.getTotalReservedQuantity(manager, params);
    if (totalReserved < params.quantity) {
      throw new BadRequestException(
        `Insufficient reserved stock for product ${params.productId} and UOM ${params.uomId}`,
      );
    }

    const batches = await this.loadAvailableBatches(manager, params);
    const allocations = allocateFromBatches(
      batches,
      params.quantity,
      product.batchPickStrategy,
    );

    const allocatedQty = allocations.reduce(
      (sum, allocation) => sum + allocation.quantity,
      0,
    );

    if (this.roundQuantity(allocatedQty) < this.roundQuantity(params.quantity)) {
      throw new BadRequestException(
        `Insufficient batch stock for product ${params.productId} and UOM ${params.uomId}`,
      );
    }

    return { product, allocations };
  }

  private async resolveBatchAllocations(
    manager: EntityManager,
    params: {
      businessId: string;
      productId: string;
      uomId: string;
      quantity: number;
      warehouseId?: string;
    },
  ): Promise<{ product: Product; allocations: BatchAllocation[] }> {
    const product = await this.loadProductForBusiness(
      manager,
      params.businessId,
      params.productId,
    );

    const totalAvailable = await this.getTotalAvailableQuantity(manager, params);
    if (totalAvailable < params.quantity) {
      throw new BadRequestException(
        `Insufficient stock for product ${params.productId} and UOM ${params.uomId}`,
      );
    }

    const batches = await this.loadAvailableBatches(manager, params);
    const allocations = allocateFromBatches(
      batches,
      params.quantity,
      product.batchPickStrategy,
    );

    const allocatedQty = allocations.reduce(
      (sum, allocation) => sum + allocation.quantity,
      0,
    );

    if (this.roundQuantity(allocatedQty) < this.roundQuantity(params.quantity)) {
      throw new BadRequestException(
        `Insufficient batch stock for product ${params.productId} and UOM ${params.uomId}`,
      );
    }

    return { product, allocations };
  }

  private async applyBatchQuantityReductions(
    manager: EntityManager,
    allocations: BatchAllocation[],
  ): Promise<void> {
    const batchRepo = manager.getRepository(Batch);

    for (const allocation of allocations) {
      const batch = await batchRepo.findOne({
        where: { id: allocation.batchId, deletedAt: IsNull() },
      });

      if (!batch) {
        throw new BadRequestException('Batch not found for stock issue');
      }

      const nextQuantity = this.roundQuantity(
        Number(batch.quantity) - allocation.quantity,
      );

      if (nextQuantity < 0) {
        throw new BadRequestException('Insufficient batch stock for this operation');
      }

      await batchRepo.update(batch.id, { quantity: nextQuantity });
    }
  }

  /**
   * Receives stock into inventory: creates batch history, updates one
   * product/UOM/warehouse stock balance, and records an IN movement per line.
   */
  async receiveStockIn(
    manager: EntityManager,
    input: ReceiveStockInput,
  ): Promise<ReceiveStockLineResult[]> {
    if (!input.lines.length) {
      throw new BadRequestException('At least one stock line is required');
    }

    const batchRepo = manager.getRepository(Batch);
    const movementRepo = manager.getRepository(StockMovement);
    const results: ReceiveStockLineResult[] = [];

    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Received quantity must be greater than zero');
      }

      const batchNumber =
        line.batchNumber?.trim() ||
        (await this.generateBatchNumber(
          manager,
          input.batchNumberPrefix,
          line.productId,
          line.uomId,
        ));

      const batch = await batchRepo.save(
        batchRepo.create({
          businessId: input.businessId,
          warehouseId: input.warehouseId,
          vendorId: input.vendorId,
          batchNumber,
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          purchaseUnitPrice: this.roundAmount(line.purchaseUnitPrice),
          saleUnitMarginAmount: this.roundAmount(line.saleUnitMarginAmount),
          saleUnitMarginPercentage: this.roundAmount(line.saleUnitMarginPercentage),
          batchDate: input.batchDate,
          expiryDate: line.expiryDate ?? null,
        }),
      );

      const stockBalance = await this.upsertStockBalance(manager, {
        businessId: input.businessId,
        warehouseId: input.warehouseId,
        productId: line.productId,
        uomId: line.uomId,
        quantityDelta: line.quantity,
      });

      const movement = await movementRepo.save(
        movementRepo.create({
          businessId: input.businessId,
          warehouseId: input.warehouseId,
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          movementType: StockMovementType.IN,
          referenceType: input.referenceType,
        }),
      );

      results.push({ batch, stockBalance, movement });
    }

    return results;
  }

  /**
   * Issues stock out of inventory and records an OUT movement per line.
   */
  async consumeStockOut(
    manager: EntityManager,
    input: ConsumeStockInput,
  ): Promise<ConsumeStockLineResult[]> {
    if (!input.lines.length) {
      throw new BadRequestException('At least one stock line is required');
    }

    const movementRepo = manager.getRepository(StockMovement);
    const results: ConsumeStockLineResult[] = [];

    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Issued quantity must be greater than zero');
      }

      const { allocations } = await this.resolveBatchAllocations(manager, {
        businessId: input.businessId,
        productId: line.productId,
        uomId: line.uomId,
        quantity: line.quantity,
        warehouseId: input.warehouseId,
      });

      await this.applyBatchQuantityReductions(manager, allocations);

      const stockBalance = await this.upsertStockBalance(manager, {
        businessId: input.businessId,
        warehouseId: input.warehouseId,
        productId: line.productId,
        uomId: line.uomId,
        quantityDelta: -line.quantity,
      });

      const movement = await movementRepo.save(
        movementRepo.create({
          businessId: input.businessId,
          warehouseId: input.warehouseId,
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          movementType: StockMovementType.OUT,
          referenceType: input.referenceType,
        }),
      );

      results.push({ stockBalance, movement, batchAllocations: allocations });
    }

    return results;
  }

  /**
   * Reserves available inventory for an approved sale order using the
   * product batch pick strategy (FIFO, LIFO, or AVG_COST).
   */
  async reserveStock(
    manager: EntityManager,
    input: ReserveStockInput,
  ): Promise<ReserveStockLineResult[]> {
    if (!input.lines.length) {
      throw new BadRequestException('At least one stock line is required');
    }

    const results: ReserveStockLineResult[] = [];

    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Reserved quantity must be greater than zero');
      }

      const { allocations } = await this.resolveBatchAllocations(manager, {
        businessId: input.businessId,
        productId: line.productId,
        uomId: line.uomId,
        quantity: line.quantity,
      });

      const warehouseAllocations = groupAllocationsByWarehouse(allocations);
      const stockBalances: StockBalance[] = [];

      for (const [warehouseId, quantity] of warehouseAllocations.entries()) {
        const stockBalance = await this.updateReservedStockBalance(manager, {
          businessId: input.businessId,
          warehouseId,
          productId: line.productId,
          uomId: line.uomId,
          availableDelta: -quantity,
          onHandDelta: 0,
          reservedDelta: quantity,
        });
        stockBalances.push(stockBalance);
      }

      results.push({
        productId: line.productId,
        uomId: line.uomId,
        quantity: line.quantity,
        batchAllocations: allocations,
        stockBalances,
      });
    }

    return results;
  }

  /**
   * Issues previously reserved sale inventory out of stock using the product
   * batch pick strategy across all warehouses with reserved stock.
   */
  async consumeReservedStockOut(
    manager: EntityManager,
    input: ConsumeReservedStockInput,
  ): Promise<ConsumeReservedStockLineResult[]> {
    if (!input.lines.length) {
      throw new BadRequestException('At least one stock line is required');
    }

    const movementRepo = manager.getRepository(StockMovement);
    const results: ConsumeReservedStockLineResult[] = [];

    for (const line of input.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Issued quantity must be greater than zero');
      }

      const { allocations } = await this.resolveReservedBatchAllocations(
        manager,
        {
          businessId: input.businessId,
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
        },
      );

      await this.applyBatchQuantityReductions(manager, allocations);

      const warehouseAllocations = groupAllocationsByWarehouse(allocations);
      const stockBalances: StockBalance[] = [];
      const movements: StockMovement[] = [];

      for (const [warehouseId, quantity] of warehouseAllocations.entries()) {
        const stockBalance = await this.updateReservedStockBalance(manager, {
          businessId: input.businessId,
          warehouseId,
          productId: line.productId,
          uomId: line.uomId,
          availableDelta: 0,
          onHandDelta: -quantity,
          reservedDelta: -quantity,
        });
        stockBalances.push(stockBalance);

        const movement = await movementRepo.save(
          movementRepo.create({
            businessId: input.businessId,
            warehouseId,
            productId: line.productId,
            uomId: line.uomId,
            quantity,
            movementType: StockMovementType.OUT,
            referenceType: input.referenceType,
          }),
        );
        movements.push(movement);
      }

      results.push({
        productId: line.productId,
        uomId: line.uomId,
        quantity: line.quantity,
        batchAllocations: allocations,
        stockBalances,
        movements,
      });
    }

    return results;
  }
}
