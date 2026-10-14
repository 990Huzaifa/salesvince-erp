import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  Claim,
  ClaimBatch,
  ClaimItem,
  ClaimStock,
} from 'src/tenant-db/entities/claim.entity';

/**
 * Claim-module inventory only. Does not touch ERP batchs / stock_balances.
 */
@Injectable()
export class ClaimStockService {
  private roundQuantity(value: number): number {
    return Math.round(value);
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
    query: { page?: number; limit?: number; warehouseId?: string; search?: string },
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
   * On claim intake (submit): create ClaimBatch per item + increase ClaimStock.
   */
  async intakeFromClaim(
    manager: EntityManager,
    claim: Claim,
    items: ClaimItem[],
  ): Promise<ClaimBatch[]> {
    const batchRepo = manager.getRepository(ClaimBatch);
    const itemRepo = manager.getRepository(ClaimItem);
    const created: ClaimBatch[] = [];
    const asOf = new Date(claim.claimDate);

    for (const item of items) {
      if (item.claimBatchId) {
        continue;
      }
      const qty = this.roundQuantity(Number(item.claimedQuantity));
      if (qty <= 0) {
        throw new BadRequestException(
          `Claim item ${item.id} quantity must be greater than zero`,
        );
      }

      const batchNumber = await this.generateBatchNumber(
        manager,
        claim.claimNumber,
        item.productId,
        item.uomId,
      );

      const batch = await batchRepo.save(
        batchRepo.create({
          businessId: claim.businessId,
          claimId: claim.id,
          claimItemId: item.id,
          batchNumber,
          productId: item.productId,
          productFlavourId: item.productFlavourId,
          uomId: item.uomId,
          warehouseId: item.warehouseId,
          quantity: qty,
          originalQuantity: qty,
          batchDate: asOf,
        }),
      );

      item.claimBatchId = batch.id;
      await itemRepo.save(item);

      await this.adjustStock(manager, {
        businessId: claim.businessId,
        warehouseId: item.warehouseId,
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId,
        quantityDelta: qty,
      });

      created.push(batch);
    }

    return created;
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

    for (const { item, quantity } of items) {
      const qty = this.roundQuantity(quantity);
      if (qty <= 0) {
        continue;
      }
      if (!item.claimBatchId) {
        throw new BadRequestException(
          `Claim item ${item.id} has no claim batch — submit claim first`,
        );
      }

      const batch = await batchRepo.findOne({
        where: {
          id: item.claimBatchId,
          businessId,
          deletedAt: IsNull(),
        },
      });
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
        warehouseId: item.warehouseId,
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId,
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
    const base = `CB-${claimNumber}-${productId.slice(0, 8)}-${uomId.slice(0, 8)}`;
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
      productFlavourId: number | null;
      quantityDelta: number;
    },
  ): Promise<ClaimStock> {
    const stockRepo = manager.getRepository(ClaimStock);
    const flavourId = params.productFlavourId ?? null;

    let stock = await stockRepo.findOne({
      where: {
        businessId: params.businessId,
        warehouseId: params.warehouseId,
        productId: params.productId,
        uomId: params.uomId,
        productFlavourId: flavourId === null ? IsNull() : flavourId,
        deletedAt: IsNull(),
      },
    });

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
      Number(stock.quantityOnHand) + params.quantityDelta,
    );
    if (next < 0) {
      throw new BadRequestException('Insufficient claim stock for this operation');
    }
    stock.quantityOnHand = next;
    return stockRepo.save(stock);
  }
}
