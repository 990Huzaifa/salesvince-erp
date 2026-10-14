import { BatchPickStrategy } from 'src/tenant-db/entities/product.entity';

export type InventoryStockKey = {
  warehouseId: string;
  productId: string;
  uomId: string;
};

export type InventoryReceiveInput = InventoryStockKey & {
  quantity: number;
  unitCost: number;
  asOf: Date;
};

export type InventoryConsumeInput = InventoryStockKey & {
  quantity: number;
};

export type InventoryConsumeResult = {
  cogsAmount: number;
  allocatedQuantity: number;
  shortfallQuantity: number;
  averageUnitCost: number;
};

type InventoryLayer = InventoryStockKey & {
  id: string;
  quantity: number;
  unitCost: number;
  asOf: Date;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value);
}

/**
 * In-memory batch cost layers for ledger backfill COGS.
 * Does not touch real stock — only prices historical sales/returns.
 * Default strategy: LIFO (newest batch first).
 */
export class InventoryCostSimulator {
  private layers: InventoryLayer[] = [];
  private seq = 0;

  constructor(
    private readonly strategy: BatchPickStrategy = BatchPickStrategy.LIFO,
  ) {}

  receive(input: InventoryReceiveInput): void {
    const quantity = roundQuantity(Number(input.quantity ?? 0));
    if (quantity <= 0) {
      return;
    }

    this.layers.push({
      id: `L${++this.seq}`,
      warehouseId: input.warehouseId,
      productId: input.productId,
      uomId: input.uomId,
      quantity,
      unitCost: Number(input.unitCost ?? 0),
      asOf: input.asOf,
    });
  }

  /**
   * Consume within warehouse + product + uom using FIFO or LIFO.
   * AVG_COST uses weighted average of matching layers.
   */
  consume(input: InventoryConsumeInput): InventoryConsumeResult {
    const requested = roundQuantity(Number(input.quantity ?? 0));
    if (requested <= 0) {
      return {
        cogsAmount: 0,
        allocatedQuantity: 0,
        shortfallQuantity: 0,
        averageUnitCost: 0,
      };
    }

    const matching = this.layers.filter(
      (layer) =>
        layer.quantity > 0 &&
        layer.warehouseId === input.warehouseId &&
        layer.productId === input.productId &&
        layer.uomId === input.uomId,
    );

    if (this.strategy === BatchPickStrategy.AVG_COST) {
      return this.consumeAverage(matching, requested);
    }

    const direction = this.strategy === BatchPickStrategy.FIFO ? 1 : -1;
    matching.sort((left, right) => {
      const byDate = left.asOf.getTime() - right.asOf.getTime();
      if (byDate !== 0) {
        return byDate * direction;
      }
      return left.id.localeCompare(right.id) * direction;
    });

    let remaining = requested;
    let cogs = 0;
    let allocated = 0;

    for (const layer of matching) {
      if (remaining <= 0) {
        break;
      }
      const take = roundQuantity(Math.min(layer.quantity, remaining));
      if (take <= 0) {
        continue;
      }
      cogs += take * Number(layer.unitCost);
      layer.quantity = roundQuantity(layer.quantity - take);
      remaining = roundQuantity(remaining - take);
      allocated = roundQuantity(allocated + take);
    }

    const cogsAmount = roundAmount(cogs);
    return {
      cogsAmount,
      allocatedQuantity: allocated,
      shortfallQuantity: remaining,
      averageUnitCost:
        allocated > 0 ? roundAmount(cogsAmount / allocated) : 0,
    };
  }

  private consumeAverage(
    matching: InventoryLayer[],
    requested: number,
  ): InventoryConsumeResult {
    const totalQty = matching.reduce((sum, layer) => sum + layer.quantity, 0);
    if (totalQty <= 0) {
      return {
        cogsAmount: 0,
        allocatedQuantity: 0,
        shortfallQuantity: requested,
        averageUnitCost: 0,
      };
    }

    const totalValue = matching.reduce(
      (sum, layer) => sum + layer.quantity * Number(layer.unitCost),
      0,
    );
    const avgUnit = totalValue / totalQty;
    const take = roundQuantity(Math.min(requested, totalQty));
    let remainingToRemove = take;

    for (const layer of matching) {
      if (remainingToRemove <= 0) {
        break;
      }
      const fromLayer = roundQuantity(
        Math.min(layer.quantity, remainingToRemove),
      );
      layer.quantity = roundQuantity(layer.quantity - fromLayer);
      remainingToRemove = roundQuantity(remainingToRemove - fromLayer);
    }

    const cogsAmount = roundAmount(take * avgUnit);
    return {
      cogsAmount,
      allocatedQuantity: take,
      shortfallQuantity: roundQuantity(requested - take),
      averageUnitCost: roundAmount(avgUnit),
    };
  }

  /** Remaining inventory value at layer costs (diagnostic). */
  remainingValue(): number {
    return roundAmount(
      this.layers.reduce(
        (sum, layer) =>
          sum + Number(layer.quantity) * Number(layer.unitCost),
        0,
      ),
    );
  }
}
