import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { Distributor } from 'src/tenant-db/entities/distributor.entity';
import {
  StockTransfer,
  StockTransferItem,
} from 'src/tenant-db/entities/stock-transfer.entity';
import { ProductFlavour, ProductPricing } from 'src/tenant-db/entities/product.entity';
import { ReferenceType, StockBalance, StockMovementType } from 'src/tenant-db/entities/stock.entity';
import { ActivityLogService } from './activity-log.service';
import { StockService } from './stock.service';
import { CreateStockTransferDto } from '../dto/stock-transfer/create-stock-transfer.dto';

@Injectable()
export class StockTransferService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
  ) {}

  private normalizePage(value: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }

  private normalizeLimit(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) {
      return 10;
    }
    return Math.min(Math.floor(n), 100);
  }

  async list(
    tenantDb: DataSource,
    pageInput: number,
    limitInput: number,
    search: string,
    user: { userId: string },
  ) {
    const page = this.normalizePage(pageInput);
    const limit = this.normalizeLimit(limitInput);
    const repo = tenantDb.getRepository(StockTransfer);

    const baseQb = repo
      .createQueryBuilder('st')
      .innerJoin('st.fromDistributor', 'fd')
      .innerJoin('st.toDistributor', 'td');

    const normalizedSearch = (search ?? '').trim();
    if (normalizedSearch) {
      baseQb.andWhere(
        new Brackets((sub) => {
          sub
            .where('fd.name ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('td.name ILIKE :search', { search: `%${normalizedSearch}%` })
            .orWhere('st.remarks ILIKE :search', { search: `%${normalizedSearch}%` });
        }),
      );
    }

    const total = await baseQb.clone().getCount();

    const rawRows = await baseQb
      .clone()
      .select('st.id', 'id')
      .addSelect('st."transferDate"', 'date')
      .addSelect('st.remarks', 'remarks')
      .addSelect('st."createdAt"', 'createdAt')
      .addSelect('fd.name', 'fromDistributorName')
      .addSelect('td.name', 'toDistributorName')
      .addSelect(
        '(SELECT COUNT(DISTINCT i."productId")::int FROM stock_transfer_items i WHERE i."StockTransferId" = st.id)',
        'totalProducts',
      )
      .addSelect(
        '(SELECT COALESCE(SUM(i.quantity), 0)::int FROM stock_transfer_items i WHERE i."StockTransferId" = st.id)',
        'totalQuantity',
      )
      .orderBy('st."createdAt"', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany();

    const result = rawRows.map((row) => ({
      id: row.id,
      fromDistributorName: row.fromDistributorName,
      toDistributorName: row.toDistributorName,
      date: row.date,
      remarks: row.remarks,
      totalProducts: Number(row.totalProducts) || 0,
      totalQuantity: Number(row.totalQuantity) || 0,
      createdAt: row.createdAt,
    }));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'STOCK_TRANSFER_LISTED',
      description: 'Stock transfers listed',
      metadata: { total, page, limit },
    });

    return { result, meta: { total, page, limit } };
  }

  async view(
    tenantDb: DataSource,
    id: string,
    user: { userId: string },
    options?: { recordActivityLog?: boolean },
  ) {
    const recordActivityLog = options?.recordActivityLog !== false;

    const transfer = await tenantDb.getRepository(StockTransfer).findOne({
      where: { id },
      relations: [
        'fromDistributor',
        'toDistributor',
        'items',
        'items.product',
        'items.productFlavour',
        'items.productFlavour.flavour',
        'items.productPricing',
        'items.productPricing.uom',
      ],
    });

    if (!transfer) {
      throw new NotFoundException('Stock transfer not found');
    }

    const productIds = new Set(transfer.items.map((i) => i.productId));
    const totalQuantity = transfer.items.reduce((sum, i) => sum + i.quantity, 0);

    const lineItems = transfer.items.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      product: line.product
        ? {
            id: line.product.id,
            name: line.product.name,
            skuCode: line.product.skuCode,
          }
        : null,
      flavour: line.productFlavour?.flavour
        ? {
            id: line.productFlavour.flavour.id,
            name: line.productFlavour.flavour.name,
          }
        : null,
      pricing: line.productPricing
        ? {
            id: line.productPricing.id,
            tradePrice: line.productPricing.tradePrice,
            retailPrice: line.productPricing.retailPrice,
            uom: line.productPricing.uom
              ? { id: line.productPricing.uom.id, name: line.productPricing.uom.name }
              : null,
          }
        : null,
    }));

    if (recordActivityLog) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        action: 'STOCK_TRANSFER_VIEWED',
        description: 'Stock transfer viewed',
        metadata: { stockTransferId: transfer.id },
      });
    }

    return {
      id: transfer.id,
      fromDistributor: transfer.fromDistributor
        ? { id: transfer.fromDistributor.id, name: transfer.fromDistributor.name }
        : null,
      toDistributor: transfer.toDistributor
        ? { id: transfer.toDistributor.id, name: transfer.toDistributor.name }
        : null,
      date: transfer.transferDate,
      remarks: transfer.remarks,
      totalProducts: productIds.size,
      totalQuantity,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      items: lineItems,
    };
  }

  async create(
    tenantDb: DataSource,
    dto: CreateStockTransferDto,
    user: { userId: string },
  ) {
    if (dto.fromDistributorId === dto.toDistributorId) {
      throw new BadRequestException(
        'Source and destination distributors must be different',
      );
    }

    const [fromDistributor, toDistributor] = await Promise.all([
      tenantDb.getRepository(Distributor).findOne({
        where: { id: dto.fromDistributorId, isDeleted: false },
      }),
      tenantDb.getRepository(Distributor).findOne({
        where: { id: dto.toDistributorId, isDeleted: false },
      }),
    ]);

    if (!fromDistributor) {
      throw new NotFoundException('Source distributor not found');
    }
    if (!toDistributor) {
      throw new NotFoundException('Destination distributor not found');
    }

    for (const line of dto.items) {
      const flavour = await tenantDb.getRepository(ProductFlavour).findOne({
        where: { id: line.productFlavourId.toString(), productId: line.productId },
        select: ['id'],
      });
      if (!flavour) {
        throw new BadRequestException(
          `Product flavour ${line.productFlavourId} is not valid for product ${line.productId}`,
        );
      }

      const pricing = await tenantDb.getRepository(ProductPricing).findOne({
        where: { id: line.productPricingId, productId: line.productId },
        select: ['id'],
      });
      if (!pricing) {
        throw new BadRequestException(
          `Product pricing ${line.productPricingId} is not valid for product ${line.productId}`,
        );
      }
    }

    const transferId = await tenantDb.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);
      const itemRepo = manager.getRepository(StockTransferItem);

      const transfer = await transferRepo.save(
        transferRepo.create({
          fromDistributorId: dto.fromDistributorId,
          toDistributorId: dto.toDistributorId,
          remarks: dto.remarks.trim(),
          transferDate: new Date(dto.date),
        }),
      );

      await itemRepo.save(
        dto.items.map((line) =>
          itemRepo.create({
            StockTransferId: transfer.id,
            productId: line.productId,
            productFlavourId: line.productFlavourId.toString(),
            productPricingId: line.productPricingId,
            quantity: Number(line.quantity),
          }),
        ),
      );

      for (const line of dto.items) {
        await this.stockService.applyStockMovement(manager, {
          distributorId: dto.fromDistributorId,
          productId: line.productId,
          productFlavourId: line.productFlavourId.toString(),
          productPricingId: line.productPricingId,
          quantity: Number(line.quantity),
          type: StockMovementType.OUT,
          referenceType: ReferenceType.TRANSFER,
        });

        await this.stockService.applyStockMovement(manager, {
          distributorId: dto.toDistributorId,
          productId: line.productId,
          productFlavourId: line.productFlavourId.toString(),
          productPricingId: line.productPricingId,
          quantity: Number(line.quantity),
          type: StockMovementType.IN,
          referenceType: ReferenceType.TRANSFER,
        });
      }

      return transfer.id;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      action: 'STOCK_TRANSFER_CREATED',
      description: 'Stock transfer created',
      metadata: {
        stockTransferId: transferId,
        fromDistributorId: dto.fromDistributorId,
        toDistributorId: dto.toDistributorId,
      },
    });

    return this.view(tenantDb, transferId, user);
  }

  async stockByDistributor(
    tenantDb: DataSource,
    distributorId: string,
  ) {
    const stock = await tenantDb.getRepository(StockBalance).find({
      where: { distributorId },
      relations: {
        product: true,
        productFlavour: { flavour: true },
        productPricing: { uom: true },
      },
    });

    return stock;
  }
}
