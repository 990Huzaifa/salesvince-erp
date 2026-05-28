import { BatchPickStrategy } from 'src/tenant-db/entities/product.entity';
import { Batch } from 'src/tenant-db/entities/stock.entity';

export type BatchAllocation = {
  batchId: string;
  warehouseId: string;
  quantity: number;
};

export type StockPricingSelection = {
  purchaseUnitPrice: number;
  saleUnitMarginAmount: number;
  saleUnitMarginPercentage: number;
  selectedBatch: {
    id: string;
    batchNumber: string;
    uomId: string;
    batchDate: Date;
  } | null;
};

const roundAmount = (value: number): number =>
  Math.round(value * 100) / 100;

const roundQuantity = (value: number): number =>
  Math.round(value * 1000) / 1000;

export function sortBatchesByStrategy(
  batches: Batch[],
  strategy: BatchPickStrategy,
): Batch[] {
  if (strategy === BatchPickStrategy.AVG_COST) {
    return [...batches];
  }

  const direction = strategy === BatchPickStrategy.FIFO ? 1 : -1;

  return [...batches].sort((left, right) => {
    const leftTime = new Date(left.batchDate).getTime();
    const rightTime = new Date(right.batchDate).getTime();

    if (leftTime !== rightTime) {
      return (leftTime - rightTime) * direction;
    }

    return (
      (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) *
      direction
    );
  });
}

function allocateProportionally(
  batches: Batch[],
  requestedQty: number,
): BatchAllocation[] {
  const withStock = batches.filter((batch) => Number(batch.quantity) > 0);
  const totalQty = withStock.reduce(
    (sum, batch) => sum + Number(batch.quantity),
    0,
  );

  if (totalQty <= 0 || requestedQty <= 0) {
    return [];
  }

  const allocations: BatchAllocation[] = [];
  let remaining = requestedQty;

  for (let index = 0; index < withStock.length; index += 1) {
    const batch = withStock[index];
    const batchQty = Number(batch.quantity);
    const isLast = index === withStock.length - 1;
    const take = isLast
      ? roundQuantity(remaining)
      : roundQuantity(Math.min(batchQty, (batchQty / totalQty) * requestedQty));

    if (take <= 0) {
      continue;
    }

    allocations.push({
      batchId: batch.id,
      warehouseId: batch.warehouseId,
      quantity: take,
    });
    remaining = roundQuantity(remaining - take);
  }

  return allocations;
}

export function allocateFromBatches(
  batches: Batch[],
  requestedQty: number,
  strategy: BatchPickStrategy,
): BatchAllocation[] {
  const withStock = batches.filter((batch) => Number(batch.quantity) > 0);

  if (requestedQty <= 0 || withStock.length === 0) {
    return [];
  }

  if (strategy === BatchPickStrategy.AVG_COST) {
    return allocateProportionally(withStock, requestedQty);
  }

  const sorted = sortBatchesByStrategy(withStock, strategy);
  const allocations: BatchAllocation[] = [];
  let remaining = requestedQty;

  for (const batch of sorted) {
    if (remaining <= 0) {
      break;
    }

    const available = Number(batch.quantity);
    const take = roundQuantity(Math.min(remaining, available));

    if (take <= 0) {
      continue;
    }

    allocations.push({
      batchId: batch.id,
      warehouseId: batch.warehouseId,
      quantity: take,
    });
    remaining = roundQuantity(remaining - take);
  }

  return allocations;
}

export function groupAllocationsByWarehouse(
  allocations: BatchAllocation[],
): Map<string, number> {
  const grouped = new Map<string, number>();

  for (const allocation of allocations) {
    const current = grouped.get(allocation.warehouseId) ?? 0;
    grouped.set(
      allocation.warehouseId,
      roundQuantity(current + allocation.quantity),
    );
  }

  return grouped;
}

export function selectStockPricing(
  strategy: BatchPickStrategy,
  batches: Batch[],
): StockPricingSelection {
  if (batches.length === 0) {
    return {
      purchaseUnitPrice: 0,
      saleUnitMarginAmount: 0,
      saleUnitMarginPercentage: 0,
      selectedBatch: null,
    };
  }

  if (strategy === BatchPickStrategy.AVG_COST) {
    const totalQuantity = batches.reduce(
      (sum, batch) => sum + Number(batch.quantity ?? 0),
      0,
    );

    if (totalQuantity <= 0) {
      return {
        purchaseUnitPrice: 0,
        saleUnitMarginAmount: 0,
        saleUnitMarginPercentage: 0,
        selectedBatch: null,
      };
    }

    const weightedAverage = (field: keyof Batch) =>
      batches.reduce(
        (sum, batch) =>
          sum + Number(batch[field] ?? 0) * Number(batch.quantity ?? 0),
        0,
      ) / totalQuantity;

    return {
      purchaseUnitPrice: roundAmount(weightedAverage('purchaseUnitPrice')),
      saleUnitMarginAmount: roundAmount(weightedAverage('saleUnitMarginAmount')),
      saleUnitMarginPercentage: roundAmount(
        weightedAverage('saleUnitMarginPercentage'),
      ),
      selectedBatch: null,
    };
  }

  const selectedBatch = sortBatchesByStrategy(batches, strategy)[0];

  return {
    purchaseUnitPrice: Number(selectedBatch.purchaseUnitPrice ?? 0),
    saleUnitMarginAmount: Number(selectedBatch.saleUnitMarginAmount ?? 0),
    saleUnitMarginPercentage: Number(
      selectedBatch.saleUnitMarginPercentage ?? 0,
    ),
    selectedBatch: {
      id: selectedBatch.id,
      batchNumber: selectedBatch.batchNumber,
      uomId: selectedBatch.uomId,
      batchDate: selectedBatch.batchDate,
    },
  };
}
