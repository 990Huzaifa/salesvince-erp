import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Claim,
  ClaimBatch,
  ClaimItem,
  ClaimStock,
} from 'src/tenant-db/entities/claim/claim.entity';

export type ClaimStockIntakeResult = {
  createdBatches: ClaimBatch[];
  stockIncrements: number;
};

/**
 * Claim-module inventory only. Does not touch ERP batchs / stock_balances.
 *
 * Link model (current entity):
 * - ClaimItem has no claimBatchId
 * - ClaimBatch.claimItemId (required) points at the item
 * - productFlavourId is int | null on item / batch / stock
 */
@Injectable()
export class ClaimStockService {
  private roundQuantity(value: number): number {
    return Math.round(value);
  }

  private toFlavourId(
    productFlavourId: string | null | undefined,
  ): string | null {
    if (productFlavourId === null || productFlavourId === undefined) {
      return null;
    }
    return productFlavourId;
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
      .leftJoinAndSelect('batch.claimItem', 'claimItem')
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
    if (!claim?.id) {
      throw new BadRequestException('Claim id is required for stock intake');
    }

    const batchRepo = manager.getRepository(ClaimBatch);
    const itemRepo = manager.getRepository(ClaimItem);
    const createdBatches: ClaimBatch[] = [];
    let stockIncrements = 0;
    const asOf = new Date(claim.claimDate);

    for (const item of items) {
      const freshItem = await itemRepo
        .createQueryBuilder('item')
        .where('item.id = :id', { id: item.id })
        .andWhere('item.claimId = :claimId', { claimId: claim.id })
        .getOne();
      if (!freshItem) {
        throw new BadRequestException(`Claim item ${item.id} not found`);
      }

      const existingBatch = await batchRepo
        .createQueryBuilder('batch')
        .where('batch.claimId = :claimId', { claimId: claim.id })
        .andWhere('batch.claimItemId = :claimItemId', {
          claimItemId: freshItem.id,
        })
        .andWhere('batch.deletedAt IS NULL')
        .getOne();
      if (existingBatch) {
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

      const productFlavourId = this.toFlavourId(freshItem.productFlavourId ?? null) ?? null;
      const claimId = String(claim.id);
      const businessId = String(claim.businessId);
      const batchId = randomUUID();
      await manager.query(
        `
        INSERT INTO claim_batches (id, businessId, claimId, claimItemId, batchNumber, productId, productFlavourId, uomId, warehouseId, quantity, originalQuantity, batchDate) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
          $6::uuid, $7::int, $8::uuid, $9::uuid,
          $10::int, $11::int, $12::date
        )
        `,
        [
          batchId,
          businessId,
          claimId,
          freshItem.id,
          batchNumber,
          freshItem.productId,
          productFlavourId,
          freshItem.uomId,
          freshItem.warehouseId,
          qty,
          qty,
          asOf,
        ],
      );

      await this.adjustStock(manager, {
        businessId: claim.businessId,
        warehouseId: freshItem.warehouseId,
        productId: freshItem.productId,
        uomId: freshItem.uomId,
        productFlavourId,
        quantityDelta: qty,
      });

      // Do not findOne/save this batch in the same UnitOfWork as Claim.save —
      // hydration + relation sync can null claimId. Return a plain stub.
      createdBatches.push({
        id: batchId,
        businessId,
        claimId,
        claimItemId: freshItem.id,
        batchNumber,
        productId: freshItem.productId,
        productFlavourId,
        uomId: freshItem.uomId,
        warehouseId: freshItem.warehouseId,
        quantity: qty,
        originalQuantity: qty,
        batchDate: asOf,
      } as ClaimBatch);
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
      if (!freshItem) {
        throw new BadRequestException(`Claim item ${item.id} not found`);
      }

      const batch = await batchRepo
        .createQueryBuilder('batch')
        .setLock('pessimistic_write')
        .where('batch.claimItemId = :claimItemId', {
          claimItemId: freshItem.id,
        })
        .andWhere('batch.businessId = :businessId', { businessId })
        .andWhere('batch.deletedAt IS NULL')
        .getOne();

      if (!batch) {
        throw new BadRequestException(
          `Claim batch not found for item ${item.id} — submit claim first`,
        );
      }
      if (this.roundQuantity(Number(batch.quantity)) < qty) {
        throw new BadRequestException(
          `Insufficient claim batch qty for ${batch.batchNumber}`,
        );
      }

      batch.quantity = this.roundQuantity(Number(batch.quantity) - qty);
      await manager.query(
        `UPDATE claim_batches SET "quantity" = $1::int WHERE "id" = $2::uuid`,
        [batch.quantity, batch.id],
      );

      await this.adjustStock(manager, {
        businessId,
        warehouseId: freshItem.warehouseId,
        productId: freshItem.productId,
        uomId: freshItem.uomId,
        productFlavourId: this.toFlavourId(freshItem.productFlavourId),
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
    const flavourId = this.toFlavourId(params.productFlavourId);

    const qb = manager
      .getRepository(ClaimStock)
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

    if (flavourId === null) {
      qb.andWhere('stock.productFlavourId IS NULL');
    } else {
      qb.andWhere('stock.productFlavourId = :flavourId', { flavourId });
    }

    let stock = await qb.getOne();

    if (!stock) {
      const stockId = randomUUID();
      await manager.query(
        `
        INSERT INTO claim_stocks (
          "id",
          "businessId",
          "warehouseId",
          "productId",
          "uomId",
          "productFlavourId",
          "quantityOnHand"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::int, 0
        )
        `,
        [
          stockId,
          params.businessId,
          params.warehouseId,
          params.productId,
          params.uomId,
          flavourId,
        ],
      );
      stock = await manager.getRepository(ClaimStock).findOneOrFail({
        where: { id: stockId },
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

    await manager.query(
      `UPDATE claim_stocks SET "quantityOnHand" = $1::int WHERE "id" = $2::uuid`,
      [next, stock.id],
    );
    stock.quantityOnHand = next;
    return stock;
  }
}
