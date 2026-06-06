import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Product, ProductPricing, Uom } from 'src/tenant-db/entities/product.entity';
import {
  Batch,
  ReferenceType,
  StockBalance,
  StockMovement,
} from 'src/tenant-db/entities/stock.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { CreateProductMergeDto } from '../../dto/inventory/create-product-merge.dto';
import { StockService } from '../stock.service';
import { ActivityLogService } from '../activity-log.service';
import { BatchAllocation } from '../../utils/stock-batch.util';

type SourceLineKey = string;

@Injectable()
export class ProductMergeService {
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

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private sourceLineKey(
    warehouseId: string,
    productId: string,
    uomId: string,
  ): SourceLineKey {
    return `${warehouseId}:${productId}:${uomId}`;
  }

  private normalizeMargins(
    purchaseUnitPrice: number,
    saleUnitMarginAmount: number,
    saleUnitMarginPercentage: number,
  ): { saleUnitMarginAmount: number; saleUnitMarginPercentage: number } {
    let amount = Number(saleUnitMarginAmount);
    let percentage = Number(saleUnitMarginPercentage);

    if (!amount && percentage) {
      amount = this.roundAmount((purchaseUnitPrice * percentage) / 100);
    }

    if (amount && !percentage) {
      percentage =
        purchaseUnitPrice > 0
          ? this.roundAmount((amount / purchaseUnitPrice) * 100)
          : 0;
    }

    return {
      saleUnitMarginAmount: this.roundAmount(amount),
      saleUnitMarginPercentage: this.roundAmount(percentage),
    };
  }

  private assertNoDuplicateSourceLines(
    dto: CreateProductMergeDto,
  ): void {
    const seen = new Set<SourceLineKey>();

    for (const line of dto.sourceLines) {
      const key = this.sourceLineKey(
        line.warehouseId,
        line.productId,
        line.uomId,
      );

      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate source line for the same warehouse, product, and UOM',
        );
      }

      seen.add(key);
    }
  }

  private groupSourceLinesByWarehouse(
    sourceLines: CreateProductMergeDto['sourceLines'],
  ): Map<string, CreateProductMergeDto['sourceLines']> {
    const grouped = new Map<string, CreateProductMergeDto['sourceLines']>();

    for (const line of sourceLines) {
      const existing = grouped.get(line.warehouseId) ?? [];
      existing.push(line);
      grouped.set(line.warehouseId, existing);
    }

    return grouped;
  }

  private async assertWarehouseForBusiness(
    manager: EntityManager,
    businessId: string,
    warehouseId: string,
  ): Promise<Warehouse> {
    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${warehouseId} not found`);
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
        `Insufficient stock for product ${productId} in warehouse ${warehouseId} (available: ${available}, requested: ${quantity})`,
      );
    }
  }

  private async assertResultPricing(
    manager: EntityManager,
    businessId: string,
    productId: string,
    uomId: string,
  ): Promise<ProductPricing> {
    const pricing = await manager.getRepository(ProductPricing).findOne({
      where: { productId, uomId },
      relations: { product: true },
    });

    if (!pricing || pricing.product.businessId !== businessId) {
      throw new BadRequestException(
        `Result product ${productId} has no pricing for UOM ${uomId}`,
      );
    }

    return pricing;
  }

  private async validateMergeRequest(
    manager: EntityManager,
    businessId: string,
    dto: CreateProductMergeDto,
  ): Promise<void> {
    this.assertNoDuplicateSourceLines(dto);

    for (const line of dto.sourceLines) {
      await this.assertWarehouseForBusiness(
        manager,
        businessId,
        line.warehouseId,
      );
      await this.assertProductForBusiness(manager, businessId, line.productId);
      await this.assertUomForBusiness(manager, businessId, line.uomId);
      await this.assertStockAvailability(
        manager,
        businessId,
        line.warehouseId,
        line.productId,
        line.uomId,
        line.quantity,
      );
    }

    await this.assertWarehouseForBusiness(
      manager,
      businessId,
      dto.result.warehouseId,
    );
    await this.assertProductForBusiness(
      manager,
      businessId,
      dto.result.productId,
    );
    await this.assertUomForBusiness(manager, businessId, dto.result.uomId);
    await this.assertResultPricing(
      manager,
      businessId,
      dto.result.productId,
      dto.result.uomId,
    );
  }

  private async resolveVendorIdFromAllocations(
    manager: EntityManager,
    allocations: BatchAllocation[],
  ): Promise<string> {
    if (!allocations.length) {
      throw new BadRequestException('No batch allocations found for merge');
    }

    const batchIds = [...new Set(allocations.map((row) => row.batchId))];
    const batches = await manager.getRepository(Batch).find({
      where: { id: In(batchIds), deletedAt: IsNull() },
    });
    const batchMap = new Map(batches.map((batch) => [batch.id, batch]));

    let bestVendorId = batches[0]?.vendorId;
    let bestCost = 0;

    for (const allocation of allocations) {
      const batch = batchMap.get(allocation.batchId);
      if (!batch) {
        continue;
      }

      const cost = Number(batch.purchaseUnitPrice) * allocation.quantity;
      if (cost > bestCost) {
        bestCost = cost;
        bestVendorId = batch.vendorId;
      }
    }

    if (!bestVendorId) {
      throw new BadRequestException('Unable to resolve vendor for merged batch');
    }

    return bestVendorId;
  }

  private async computeTotalSourceCost(
    manager: EntityManager,
    allocations: BatchAllocation[],
  ): Promise<number> {
    if (!allocations.length) {
      return 0;
    }

    const batchIds = [...new Set(allocations.map((row) => row.batchId))];
    const batches = await manager.getRepository(Batch).find({
      where: { id: In(batchIds), deletedAt: IsNull() },
    });
    const batchMap = new Map(batches.map((batch) => [batch.id, batch]));

    let total = 0;

    for (const allocation of allocations) {
      const batch = batchMap.get(allocation.batchId);
      if (!batch) {
        continue;
      }

      total += Number(batch.purchaseUnitPrice) * allocation.quantity;
    }

    return this.roundAmount(total);
  }

  private formatMergeDatePrefix(mergeDate: Date): string {
    const year = mergeDate.getFullYear();
    const month = String(mergeDate.getMonth() + 1).padStart(2, '0');
    const day = String(mergeDate.getDate()).padStart(2, '0');
    return `MERGE-${year}${month}${day}`;
  }

  async merge(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateProductMergeDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const mergeDate = dto.mergeDate ? new Date(dto.mergeDate) : new Date();

    const result = await tenantDb.transaction(async (manager) => {
      await this.validateMergeRequest(manager, scopedBusinessId, dto);

      const groupedByWarehouse = this.groupSourceLinesByWarehouse(dto.sourceLines);
      const sourceOutResults: Array<{
        warehouseId: string;
        movements: StockMovement[];
        batchAllocations: BatchAllocation[];
      }> = [];
      const allAllocations: BatchAllocation[] = [];

      for (const [warehouseId, lines] of groupedByWarehouse.entries()) {
        const outResults = await this.stockService.consumeStockOut(manager, {
          businessId: scopedBusinessId,
          warehouseId,
          referenceType: ReferenceType.MERGE,
          lines: lines.map((line) => ({
            productId: line.productId,
            uomId: line.uomId,
            quantity: line.quantity,
          })),
        });

        const batchAllocations = outResults.flatMap(
          (row) => row.batchAllocations,
        );
        allAllocations.push(...batchAllocations);

        sourceOutResults.push({
          warehouseId,
          movements: outResults.map((row) => row.movement),
          batchAllocations,
        });
      }

      const totalSourceCost = await this.computeTotalSourceCost(
        manager,
        allAllocations,
      );
      const vendorId = await this.resolveVendorIdFromAllocations(
        manager,
        allAllocations,
      );
      const margins = this.normalizeMargins(
        dto.result.purchaseUnitPrice,
        dto.result.saleUnitMarginAmount,
        dto.result.saleUnitMarginPercentage,
      );

      const inResults = await this.stockService.receiveStockIn(manager, {
        businessId: scopedBusinessId,
        warehouseId: dto.result.warehouseId,
        vendorId,
        referenceType: ReferenceType.MERGE,
        batchDate: mergeDate,
        batchNumberPrefix: this.formatMergeDatePrefix(mergeDate),
        lines: [
          {
            productId: dto.result.productId,
            uomId: dto.result.uomId,
            quantity: dto.result.quantity,
            purchaseUnitPrice: dto.result.purchaseUnitPrice,
            saleUnitMarginAmount: margins.saleUnitMarginAmount,
            saleUnitMarginPercentage: margins.saleUnitMarginPercentage,
          },
        ],
      });

      const resultLine = inResults[0];
      const suggestedPurchaseUnitPrice =
        dto.result.quantity > 0
          ? this.roundAmount(totalSourceCost / dto.result.quantity)
          : 0;

      return {
        mergeDate,
        totalSourceCost,
        suggestedPurchaseUnitPrice,
        sourceOutResults,
        resultMovement: resultLine.movement,
        resultBatch: resultLine.batch,
        resultStockBalance: resultLine.stockBalance,
      };
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PRODUCT_MERGE',
      description: `Merged ${dto.sourceLines.length} source lines into product ${dto.result.productId}`,
      metadata: {
        sourceLineCount: dto.sourceLines.length,
        resultProductId: dto.result.productId,
        resultUomId: dto.result.uomId,
        resultWarehouseId: dto.result.warehouseId,
        resultQuantity: dto.result.quantity,
        totalSourceCost: result.totalSourceCost,
      },
    });

    return result;
  }
}
