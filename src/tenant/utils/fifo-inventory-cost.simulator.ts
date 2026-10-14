/**
 * @deprecated Use InventoryCostSimulator from inventory-cost.simulator.ts
 * (supports LIFO / FIFO / AVG_COST). Kept as a thin alias for any old imports.
 */
export {
  InventoryCostSimulator as FifoInventoryCostSimulator,
  type InventoryStockKey as FifoStockKey,
  type InventoryReceiveInput as FifoReceiveInput,
  type InventoryConsumeInput as FifoConsumeInput,
  type InventoryConsumeResult as FifoConsumeResult,
} from './inventory-cost.simulator';
