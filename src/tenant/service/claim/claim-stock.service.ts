import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Claim,
  ClaimBatch,
  ClaimItem,
  ClaimStock,
} from 'src/tenant-db/entities/claim.entity';

export type ClaimStockIntakeResult = {
  createdBatches: ClaimBatch[];
  stockIncrements: number;
};

/**
 * Claim-module inventory only. Does not touch ERP batchs / stock_balances.
 */
@Injectable()
export class ClaimStockService {
  private roundQuantity(value: number): number {
    return Math.round(value);
  }

  /** ClaimItem uses int; ClaimBatch / ClaimStock use string | null. */
  private toFlavourKey(
    productFlavourId: number | string | null | undefined,
  ): string | null {
    if (productFlavourId === null || productFlavourId === undefined) {
      return null;
    }
    return String(productFlavourId);
  }

  async listBatches(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: { page?: number; limit?: number; claimId?: string; search?: string },
  ) {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = tenantDb
      .getRepository(ClaimBatch)
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.product', 'product')
      .leftJoinAndSelect('batch.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('batch.uom', 'uom')
      .leftJoinAndSelect('batch.warehouse', 'warehouse')
      .where('batch.businessId = :businessId', { businessId })
      .andWhere('batch.deletedAt IS NULL')
      .orderBy('batch.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.claimId) {
      qb.andWhere('batch.claimId = :claimId', { claimId: query.claimId });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(batch.batchNumber ILIKE :search OR product.name ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      meta: { total, page, limit },
    };
  }

  async listStock(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: {
      page?: number;
      limit?: number;
      warehouseId?: string;
      search?: string;
    },
  ) {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = tenantDb
      .getRepository(ClaimStock)
      .createQueryBuilder('stock')
      .leftJoinAndSelect('stock.product', 'product')
      .leftJoinAndSelect('stock.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('stock.uom', 'uom')
      .leftJoinAndSelect('stock.warehouse', 'warehouse')
      .where('stock.businessId = :businessId', { businessId })
      .andWhere('stock.deletedAt IS NULL')
      .orderBy('product.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.warehouseId) {
      qb.andWhere('stock.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    }
    if (query.search?.trim()) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${query.search.trim()}%`,
      });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
      meta: { total, page, limit },
    };
  }

  /**
   * Submit intake: create ClaimBatch per item (if missing) + increase ClaimStock.
   */
  async intakeFromClaim(
    manager: EntityManager,
    claim: Claim,
    items: ClaimItem[],
  ): Promise<ClaimStockIntakeResult> {
    if (!items?.length) {
      throw new BadRequestException('Claim must have items for stock intake');
    }

    const batchRepo = manager.getRepository(ClaimBatch);
    const itemRepo = manager.getRepository(ClaimItem);
    const createdBatches: ClaimBatch[] = [];
    let stockIncrements = 0;
    const asOf = new Date(claim.claimDate);

    for (const item of items) {
      // Fresh row — avoid stale claimBatchId from relations
      const freshItem = await itemRepo.findOne({
        where: { id: item.id, claimId: claim.id },
      });
      if (!freshItem) {
        throw new BadRequestException(`Claim item ${item.id} not found`);
      }

      if (freshItem.claimBatchId) {
        continue;
      }

      const qty = this.roundQuantity(Number(freshItem.claimedQuantity));
      if (qty <= 0) {
        throw new BadRequestException(
          `Claim item ${freshItem.id} quantity must be greater than zero`,
        );
      }

      const batchNumber = await this.generateBatchNumber(
        manager,
        claim.claimNumber,
        freshItem.productId,
        freshItem.uomId,
      );

      const productFlavourId = this.toFlavourKey(freshItem.productFlavourId);

      const batch = await batchRepo.save(
        batchRepo.create({
          businessId: claim.businessId,
          claimId: claim.id,
          claimItemId: freshItem.id,
          batchNumber,
          productId: freshItem.productId,
          productFlavourId,
          uomId: freshItem.uomId,
          warehouseId: freshItem.warehouseId,
          quantity: qty,
          originalQuantity: qty,
          batchDate: asOf,
        }),
      );

      freshItem.claimBatchId = batch.id;
      await itemRepo.save(freshItem);

      await this.adjustStock(manager, {
        businessId: claim.businessId,
        warehouseId: freshItem.warehouseId,
        productId: freshItem.productId,
        uomId: freshItem.uomId,
        productFlavourId,
        quantityDelta: qty,
      });

      createdBatches.push(batch);
      stockIncrements += qty;
    }

    if (createdBatches.length === 0) {
      throw new BadRequestException(
        'Claim stock intake already done for all items (batches exist)',
      );
    }

    return { createdBatches, stockIncrements };
  }

  /**
   * Reduce claim batch + claim stock (discard / deliver / return to location).
   */
  async consumeClaimItems(
    manager: EntityManager,
    businessId: string,
    items: Array<{ item: ClaimItem; quantity: number }>,
  ): Promise<void> {
    const batchRepo = manager.getRepository(ClaimBatch);
    const itemRepo = manager.getRepository(ClaimItem);

    for (const { item, quantity } of items) {
      const qty = this.roundQuantity(quantity);
      if (qty <= 0) {
        continue;
      }

      const freshItem = await itemRepo.findOne({ where: { id: item.id } });
      if (!freshItem?.claimBatchId) {
        throw new BadRequestException(
          `Claim item ${item.id} has no claim batch — submit claim first`,
        );
      }

      const batch = await batchRepo
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.id = :id', { id: freshItem.claimBatchId })
        .andWhere('batch.businessId = :businessId', { businessId })
        .andWhere('batch.deletedAt IS NULL')
        .getOne();

      if (!batch) {
        throw new BadRequestException(
          `Claim batch not found for item ${item.id}`,
        );
      }
      if (this.roundQuantity(Number(batch.quantity)) < qty) {
        throw new BadRequestException(
          `Insufficient claim batch qty for ${batch.batchNumber}`,
        );
      }

      batch.quantity = this.roundQuantity(Number(batch.quantity) - qty);
      await batchRepo.save(batch);

      await this.adjustStock(manager, {
        businessId,
        warehouseId: freshItem.warehouseId,
        productId: freshItem.productId,
        uomId: freshItem.uomId,
        productFlavourId: this.toFlavourKey(freshItem.productFlavourId),
        quantityDelta: -qty,
      });
    }
  }

  private async generateBatchNumber(
    manager: EntityManager,
    claimNumber: string,
    productId: string,
    uomId: string,
  ): Promise<string> {
    const safeClaim = claimNumber.replace(/[^a-zA-Z0-9-]/g, '');
    const base = `CB-${safeClaim}-${productId.slice(0, 8)}-${uomId.slice(0, 8)}`;
    const last = await manager
      .getRepository(ClaimBatch)
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

  private async adjustStock(
    manager: EntityManager,
    params: {
      businessId: string;
      warehouseId: string;
      productId: string;
      uomId: string;
      productFlavourId: string | null;
      quantityDelta: number;
    },
  ): Promise<ClaimStock> {
    const stockRepo = manager.getRepository(ClaimStock);
    const flavourId = this.toFlavourKey(params.productFlavourId);

    const qb = stockRepo
      .createQueryBuilder('stock')
      .setLock('pessimistic_write')
      .where('stock.businessId = :businessId', {
        businessId: params.businessId,
      })
      .andWhere('stock.warehouseId = :warehouseId', {
        warehouseId: params.warehouseId,
      })
      .andWhere('stock.productId = :productId', {
        productId: params.productId,
      })
      .andWhere('stock.uomId = :uomId', { uomId: params.uomId })
      .andWhere('stock.deletedAt IS NULL');

    // Matches split unique indexes (with / without flavour)
    if (flavourId === null) {
      qb.andWhere('stock.productFlavourId IS NULL');
    } else {
      qb.andWhere('stock.productFlavourId = :flavourId', { flavourId });
    }

    let stock = await qb.getOne();

    if (!stock) {
      stock = stockRepo.create({
        businessId: params.businessId,
        warehouseId: params.warehouseId,
        productId: params.productId,
        uomId: params.uomId,
        productFlavourId: flavourId,
        quantityOnHand: 0,
      });
    }

    const next = this.roundQuantity(
      Number(stock.quantityOnHand ?? 0) + params.quantityDelta,
    );
    if (next < 0) {
      throw new BadRequestException(
        'Insufficient claim stock for this operation',
      );
    }
    stock.quantityOnHand = next;
    return stockRepo.save(stock);
  }
}
