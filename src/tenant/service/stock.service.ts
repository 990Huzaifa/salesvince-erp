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

@Injectable()
export class StockService {
  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
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
}
