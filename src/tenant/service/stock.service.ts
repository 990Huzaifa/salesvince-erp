import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  Batch,
  ReferenceType,
  StockBalance,
  StockMovement,
  StockMovementType,
} from 'src/tenant-db/entities/stock.entity';

export type ReceiveStockLineInput = {
  productId: string;
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
  batchBalance: StockBalance;
  aggregateBalance: StockBalance;
  movement: StockMovement;
};

@Injectable()
export class StockService {
  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async generateBatchNumber(
    manager: EntityManager,
    prefix: string,
    productId: string,
  ): Promise<string> {
    const base = `${prefix}-${productId.slice(0, 8)}`;
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

  private async upsertAggregateBalance(
    manager: EntityManager,
    params: {
      businessId: string;
      warehouseId: string;
      productId: string;
      quantityDelta: number;
    },
  ): Promise<StockBalance> {
    const balanceRepo = manager.getRepository(StockBalance);
    let aggregate = await balanceRepo
      .createQueryBuilder('balance')
      .where('balance.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('balance.warehouseId = :warehouseId', {
        warehouseId: params.warehouseId,
      })
      .andWhere('balance.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('balance.batchId IS NULL')
      .getOne();

    if (!aggregate) {
      aggregate = balanceRepo.create({
        businessId: params.businessId,
        warehouseId: params.warehouseId,
        productId: params.productId,
        quantityAvailable: params.quantityDelta,
        quantityOnHand: params.quantityDelta,
        quantityReserved: 0,
        quantityDamaged: 0,
        batch: null,
      });
    } else {
      aggregate.quantityAvailable += params.quantityDelta;
      aggregate.quantityOnHand += params.quantityDelta;
    }

    if (aggregate.quantityOnHand < 0 || aggregate.quantityAvailable < 0) {
      throw new BadRequestException('Insufficient stock for this operation');
    }

    return balanceRepo.save(aggregate);
  }

  /**
   * Receives stock into inventory: creates batch, batch-level balance,
   * aggregate warehouse balance, and an IN movement per line.
   */
  async receiveStockIn(
    manager: EntityManager,
    input: ReceiveStockInput,
  ): Promise<ReceiveStockLineResult[]> {
    if (!input.lines.length) {
      throw new BadRequestException('At least one stock line is required');
    }

    const batchRepo = manager.getRepository(Batch);
    const balanceRepo = manager.getRepository(StockBalance);
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
        ));

      const batch = await batchRepo.save(
        batchRepo.create({
          businessId: input.businessId,
          warehouseId: input.warehouseId,
          vendorId: input.vendorId,
          batchNumber,
          productId: line.productId,
          quantity: line.quantity,
          purchaseUnitPrice: this.roundAmount(line.purchaseUnitPrice),
          saleUnitMarginAmount: this.roundAmount(line.saleUnitMarginAmount),
          saleUnitMarginPercentage: this.roundAmount(line.saleUnitMarginPercentage),
          batchDate: input.batchDate,
          expiryDate: line.expiryDate ?? null,
        }),
      );

      const batchBalance = await balanceRepo.save(
        balanceRepo.create({
          businessId: input.businessId,
          warehouseId: input.warehouseId,
          productId: line.productId,
          quantityAvailable: line.quantity,
          quantityOnHand: line.quantity,
          quantityReserved: 0,
          quantityDamaged: 0,
          batch,
        }),
      );

      const aggregateBalance = await this.upsertAggregateBalance(manager, {
        businessId: input.businessId,
        warehouseId: input.warehouseId,
        productId: line.productId,
        quantityDelta: line.quantity,
      });

      const movement = await movementRepo.save(
        movementRepo.create({
          businessId: input.businessId,
          warehouseId: input.warehouseId,
          productId: line.productId,
          quantity: line.quantity,
          movementType: StockMovementType.IN,
          referenceType: input.referenceType,
        }),
      );

      results.push({ batch, batchBalance, aggregateBalance, movement });
    }

    return results;
  }
}
