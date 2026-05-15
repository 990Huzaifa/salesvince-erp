import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ReferenceType,
  StockBalance,
  StockMovement,
  StockMovementType,
} from 'src/tenant-db/entities/stock.entity';

type ApplyStockMovementInput = {
  distributorId: string;
  productId: string;
  productFlavourId: string;
  productPricingId: string;
  quantity: number;
  type: StockMovementType;
  referenceType: ReferenceType;
};

type ApplyOrderStockMovementInput = {
  distributorId: string;
  items: Array<{
    productId: string;
    productFlavourId: string;
    productPricingId: string;
    quantity: number;
  }>;
  type: StockMovementType;
  referenceType: ReferenceType;
};

@Injectable()
export class StockService {
  async applyStockMovement(manager: EntityManager, input: ApplyStockMovementInput) {
    const movementRepo = manager.getRepository(StockMovement);
    const balanceRepo = manager.getRepository(StockBalance);

    const delta = input.type === StockMovementType.IN ? input.quantity : -input.quantity;

    const existingBalance = await balanceRepo.findOne({
      where: {
        distributorId: input.distributorId,
        productId: input.productId,
        productFlavourId: input.productFlavourId,
        productPricingId: input.productPricingId,
      },
    });

    const currentQty = existingBalance?.quantity ?? 0;
    const nextQty = currentQty + delta;

    if (nextQty < 0) {
      throw new BadRequestException('Insufficient stock balance for stock-out movement');
    }

    await movementRepo.save(
      movementRepo.create({
        distributorId: input.distributorId,
        productId: input.productId,
        productFlavourId: input.productFlavourId,
        productPricingId: input.productPricingId,
        quantity: input.quantity,
        type: input.type,
        referenceType: input.referenceType,
      }),
    );

    if (existingBalance) {
      existingBalance.quantity = nextQty;
      await balanceRepo.save(existingBalance);
      return existingBalance;
    }

    const newBalance = balanceRepo.create({
      distributorId: input.distributorId,
      productId: input.productId,
      productFlavourId: input.productFlavourId,
      productPricingId: input.productPricingId,
      quantity: nextQty,
    });
    return balanceRepo.save(newBalance);
  }

  async applyOrderStockMovement(manager: EntityManager, input: ApplyOrderStockMovementInput) {
    for (const item of input.items) {
      await this.applyStockMovement(manager, {
        distributorId: input.distributorId,
        productId: item.productId,
        productFlavourId: item.productFlavourId,
        productPricingId: item.productPricingId,
        quantity: item.quantity,
        type: input.type,
        referenceType: input.referenceType,
      });
    }
  }
}
