import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, IsNull } from 'typeorm';
import * as XLSX from 'xlsx';
import {
  OpeningStock,
  OpeningStockItem,
  OpeningStockStatus,
} from 'src/tenant-db/entities/opening-stock.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import {
  Product,
  ProductFlavour,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { CreateOpeningStockDto } from '../../dto/opening-stock/create-opening-stock.dto';
import { UpdateOpeningStockDto } from '../../dto/opening-stock/update-opening-stock.dto';
import { CreateOpeningStockItemDto } from '../../dto/opening-stock/create-opening-stock-item.dto';
import { StockService } from '../stock.service';
import { ActivityLogService } from '../activity-log.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';

const OPENING_NUMBER_PREFIX = 'OS';

type ResolvedOpeningLine = {
  productId: string;
  productFlavourId: string | null;
  uomId: string;
  quantity: number;
  purchaseUnitPrice: number;
  saleUnitPrice: number;
  expiryDate: Date | null;
};

type OpeningImportRow = {
  row: number;
  warehouseCode: string;
  productBarcode: string | null;
  productId: string | null;
  productName: string | null;
  uomName: string | null;
  uomId: string | null;
  quantity: number;
  purchaseUnitPrice: number;
  saleUnitPrice: number;
  expiryDate: string | null;
  notes: string | null;
  openingDate: string | null;
};

@Injectable()
export class OpeningStockService {
  constructor(
    private readonly stockService: StockService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundQuantity(value: number): number {
    return Math.round(value);
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private assertEditableStatus(opening: OpeningStock): void {
    if (
      opening.status !== OpeningStockStatus.PENDING &&
      opening.status !== OpeningStockStatus.FAILED
    ) {
      throw new BadRequestException(
        'Only pending or failed opening stocks can be modified',
      );
    }
  }

  private mapItem(item: OpeningStockItem) {
    return {
      id: item.id,
      openingStockId: item.openingStockId,
      productId: item.productId,
      productFlavourId: item.productFlavourId,
      uomId: item.uomId,
      quantity: item.quantity,
      purchaseUnitPrice: Number(item.purchaseUnitPrice),
      saleUnitPrice: Number(item.saleUnitPrice),
      expiryDate: item.expiryDate,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            barcode: item.product.barcode,
          }
        : undefined,
      productFlavour: item.productFlavour
        ? { id: item.productFlavour.id }
        : null,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapOpening(opening: OpeningStock) {
    return {
      id: opening.id,
      businessId: opening.businessId,
      openingNumber: opening.openingNumber,
      openingDate: opening.openingDate,
      warehouseId: opening.warehouseId,
      warehouse: opening.warehouse
        ? {
            id: opening.warehouse.id,
            code: opening.warehouse.code,
            name: opening.warehouse.name,
          }
        : undefined,
      notes: opening.notes,
      createdBy: opening.createdBy,
      status: opening.status,
      jobId: opening.jobId,
      failureReason: opening.failureReason,
      items: (opening.items ?? []).map((item) => this.mapItem(item)),
      createdAt: opening.createdAt,
      updatedAt: opening.updatedAt,
    };
  }

  private async generateOpeningNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(OpeningStock)
      .createQueryBuilder('os')
      .where('os.openingNumber LIKE :prefix', {
        prefix: `${OPENING_NUMBER_PREFIX}-%`,
      })
      .orderBy('os.openingNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.openingNumber.replace(
        `${OPENING_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${OPENING_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertWarehouseForBusiness(
    manager: EntityManager | DataSource,
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

  private async assertFlavourForProduct(
    manager: EntityManager,
    productId: string,
    productFlavourId: string,
  ): Promise<void> {
    const flavour = await manager.getRepository(ProductFlavour).findOne({
      where: { id: productFlavourId, productId },
    });
    if (!flavour) {
      throw new BadRequestException(
        `Flavour ${productFlavourId} does not belong to product ${productId}`,
      );
    }
  }

  private lineKey(line: {
    productId: string;
    uomId: string;
    productFlavourId?: string | null;
  }): string {
    return `${line.productId}:${line.uomId}:${line.productFlavourId ?? ''}`;
  }

  private async resolveItems(
    manager: EntityManager,
    businessId: string,
    items: CreateOpeningStockItemDto[],
  ): Promise<ResolvedOpeningLine[]> {
    if (!items?.length) {
      throw new BadRequestException('At least one opening stock item is required');
    }

    const seen = new Set<string>();
    const resolved: ResolvedOpeningLine[] = [];

    for (const item of items) {
      const quantity = this.roundQuantity(item.quantity);
      if (quantity <= 0) {
        throw new BadRequestException(
          'Opening stock quantity must be greater than zero',
        );
      }

      await this.assertProductForBusiness(manager, businessId, item.productId);
      await this.assertUomForBusiness(manager, businessId, item.uomId);

      if (item.productFlavourId) {
        await this.assertFlavourForProduct(
          manager,
          item.productId,
          item.productFlavourId,
        );
      }

      const key = this.lineKey(item);
      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate opening stock line for the same product, UOM, and flavour',
        );
      }
      seen.add(key);

      resolved.push({
        productId: item.productId,
        productFlavourId: item.productFlavourId ?? null,
        uomId: item.uomId,
        quantity,
        purchaseUnitPrice: this.roundAmount(item.purchaseUnitPrice),
        saleUnitPrice: this.roundAmount(item.saleUnitPrice),
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
      });
    }

    return resolved;
  }

  private async findOpeningForBusiness(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    openingId: string,
    withRelations = true,
  ): Promise<OpeningStock> {
    const qb = tenantDb
      .getRepository(OpeningStock)
      .createQueryBuilder('os')
      .where('os.id = :openingId', { openingId })
      .andWhere('os.businessId = :businessId', { businessId })
      .andWhere('os.deletedAt IS NULL');

    if (withRelations) {
      qb.leftJoinAndSelect('os.items', 'items')
        .leftJoinAndSelect('items.product', 'product')
        .leftJoinAndSelect('items.productFlavour', 'productFlavour')
        .leftJoinAndSelect('items.uom', 'uom')
        .leftJoinAndSelect('os.warehouse', 'warehouse');
    }

    const opening = await qb.getOne();
    if (!opening) {
      throw new NotFoundException('Opening stock not found');
    }
    return opening;
  }

  private async postOpeningStock(
    manager: EntityManager,
    opening: OpeningStock,
  ): Promise<void> {
    const items = opening.items ?? [];
    if (!items.length) {
      throw new BadRequestException(
        'Opening stock must have at least one item to approve',
      );
    }

    await this.stockService.receiveStockIn(manager, {
      businessId: opening.businessId,
      warehouseId: opening.warehouseId,
      vendorId: null,
      referenceType: ReferenceType.OPENING,
      batchDate: new Date(opening.openingDate),
      batchNumberPrefix: `OS-${opening.openingNumber}`,
      lines: items.map((item) => ({
        productId: item.productId,
        uomId: item.uomId,
        quantity: item.quantity,
        purchaseUnitPrice: Number(item.purchaseUnitPrice),
        saleUnitPrice: Number(item.saleUnitPrice),
        expiryDate: item.expiryDate ?? null,
      })),
    });
  }

  private async persistOpeningDocument(
    manager: EntityManager,
    businessId: string,
    actorUserId: string,
    input: {
      warehouseId: string;
      openingDate: Date;
      openingNumber?: string | null;
      notes?: string | null;
      items: ResolvedOpeningLine[];
      status?: OpeningStockStatus;
    },
  ): Promise<OpeningStock> {
    await this.assertWarehouseForBusiness(
      manager,
      businessId,
      input.warehouseId,
    );

    const openingNumber =
      input.openingNumber?.trim() ||
      (await this.generateOpeningNumber(manager));

    const existing = await manager.getRepository(OpeningStock).findOne({
      where: { openingNumber, deletedAt: IsNull() },
    });
    if (existing) {
      throw new BadRequestException(
        `Opening number ${openingNumber} already exists`,
      );
    }

    const opening = await manager.getRepository(OpeningStock).save(
      manager.getRepository(OpeningStock).create({
        businessId,
        openingNumber,
        openingDate: input.openingDate,
        warehouseId: input.warehouseId,
        notes: input.notes?.trim() || null,
        createdBy: actorUserId,
        status: input.status ?? OpeningStockStatus.PENDING,
        jobId: null,
        failureReason: null,
      }),
    );

    const itemEntities = input.items.map((line) =>
      manager.getRepository(OpeningStockItem).create({
        openingStockId: opening.id,
        productId: line.productId,
        productFlavourId: line.productFlavourId,
        uomId: line.uomId,
        quantity: line.quantity,
        purchaseUnitPrice: line.purchaseUnitPrice,
        saleUnitPrice: line.saleUnitPrice,
        batchNumber: null,
        expiryDate: line.expiryDate,
      }),
    );
    await manager.getRepository(OpeningStockItem).save(itemEntities);

    return this.findOpeningForBusiness(manager, businessId, opening.id);
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateOpeningStockDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const resolvedItems = await this.resolveItems(
        manager,
        scopedBusinessId,
        dto.items,
      );

      return this.persistOpeningDocument(manager, scopedBusinessId, actorUserId, {
        warehouseId: dto.warehouseId,
        openingDate: new Date(dto.openingDate),
        openingNumber: dto.openingNumber,
        notes: dto.notes,
        items: resolvedItems,
        status: OpeningStockStatus.PENDING,
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'OPENING_STOCK_CREATED',
      description: `Opening stock ${created.openingNumber} created`,
      metadata: {
        openingStockId: created.id,
        warehouseId: created.warehouseId,
      },
    });

    return { data: this.mapOpening(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      warehouseId?: string;
      status?: OpeningStockStatus;
    },
    _actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, Math.min(100, options.limit));
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(OpeningStock)
      .createQueryBuilder('os')
      .leftJoinAndSelect('os.warehouse', 'warehouse')
      .leftJoinAndSelect('os.items', 'items')
      .where('os.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('os.deletedAt IS NULL');

    if (options.warehouseId) {
      qb.andWhere('os.warehouseId = :warehouseId', {
        warehouseId: options.warehouseId,
      });
    }

    if (options.status) {
      qb.andWhere('os.status = :status', { status: options.status });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('os.openingNumber ILIKE :search', { search })
            .orWhere('os.notes ILIKE :search', { search })
            .orWhere('warehouse.name ILIKE :search', { search })
            .orWhere('warehouse.code ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy('os.openingDate', 'DESC')
      .addOrderBy('os.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.mapOpening(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    openingId: string,
    _actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const opening = await this.findOpeningForBusiness(
      tenantDb,
      scopedBusinessId,
      openingId,
    );
    return { data: this.mapOpening(opening) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    openingId: string,
    dto: UpdateOpeningStockDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const opening = await this.findOpeningForBusiness(
        manager,
        scopedBusinessId,
        openingId,
      );
      this.assertEditableStatus(opening);

      const warehouseId = dto.warehouseId ?? opening.warehouseId;
      await this.assertWarehouseForBusiness(
        manager,
        scopedBusinessId,
        warehouseId,
      );

      if (dto.openingNumber?.trim()) {
        const nextNumber = dto.openingNumber.trim();
        if (nextNumber !== opening.openingNumber) {
          const existing = await manager.getRepository(OpeningStock).findOne({
            where: { openingNumber: nextNumber, deletedAt: IsNull() },
          });
          if (existing) {
            throw new BadRequestException(
              `Opening number ${nextNumber} already exists`,
            );
          }
          opening.openingNumber = nextNumber;
        }
      }

      if (dto.openingDate) {
        opening.openingDate = new Date(dto.openingDate);
      }
      if (dto.notes !== undefined) {
        opening.notes = dto.notes?.trim() || null;
      }
      opening.warehouseId = warehouseId;
      opening.status = OpeningStockStatus.PENDING;
      opening.failureReason = null;
      opening.jobId = null;

      await manager.getRepository(OpeningStock).save(opening);

      if (dto.items) {
        const resolvedItems = await this.resolveItems(
          manager,
          scopedBusinessId,
          dto.items,
        );
        await manager.getRepository(OpeningStockItem).delete({
          openingStockId: opening.id,
        });
        const itemEntities = resolvedItems.map((line) =>
          manager.getRepository(OpeningStockItem).create({
            openingStockId: opening.id,
            productId: line.productId,
            productFlavourId: line.productFlavourId,
            uomId: line.uomId,
            quantity: line.quantity,
            purchaseUnitPrice: line.purchaseUnitPrice,
            saleUnitPrice: line.saleUnitPrice,
            batchNumber: null,
            expiryDate: line.expiryDate,
          }),
        );
        await manager.getRepository(OpeningStockItem).save(itemEntities);
      }

      return this.findOpeningForBusiness(manager, scopedBusinessId, opening.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'OPENING_STOCK_UPDATED',
      description: `Opening stock ${updated.openingNumber} updated`,
      metadata: { openingStockId: updated.id },
    });

    return { data: this.mapOpening(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    openingId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const opening = await this.findOpeningForBusiness(
      tenantDb,
      scopedBusinessId,
      openingId,
      false,
    );
    this.assertEditableStatus(opening);

    await tenantDb.getRepository(OpeningStock).softDelete(opening.id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'OPENING_STOCK_DELETED',
      description: `Opening stock ${opening.openingNumber} deleted`,
      metadata: { openingStockId: opening.id },
    });

    return {
      message: 'Opening stock deleted',
      data: { id: opening.id, openingNumber: opening.openingNumber },
    };
  }

  async reject(
    tenantDb: DataSource,
    businessId: string | undefined,
    openingId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const opening = await this.findOpeningForBusiness(
      tenantDb,
      scopedBusinessId,
      openingId,
      false,
    );
    this.assertEditableStatus(opening);

    opening.status = OpeningStockStatus.REJECTED;
    opening.failureReason = null;
    opening.jobId = null;
    const rejected = await tenantDb.getRepository(OpeningStock).save(opening);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'OPENING_STOCK_REJECTED',
      description: `Opening stock ${rejected.openingNumber} rejected`,
      metadata: { openingStockId: rejected.id },
    });

    return {
      message: 'Opening stock rejected',
      data: { id: rejected.id, openingNumber: rejected.openingNumber },
    };
  }

  private async notifyJobCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
    title: string,
  ) {
    const message =
      status === 'completed'
        ? `Finished. Success: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Job failed for ${job.fileName}. Please review logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        businessId: user.businessId,
        title,
        message,
        type: 'opening_stock_job',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
      },
    );
  }

  private async processApproveJob(
    tenantDb: DataSource,
    jobId: string,
    openingId: string,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    try {
      const approved = await tenantDb.transaction(async (manager) => {
        const opening = await this.findOpeningForBusiness(
          manager,
          user.businessId,
          openingId,
        );

        if (opening.status === OpeningStockStatus.APPROVED) {
          return opening;
        }

        if (opening.status !== OpeningStockStatus.PROCESSING) {
          throw new BadRequestException(
            'Opening stock is not ready for approval processing',
          );
        }

        await this.postOpeningStock(manager, opening);
        opening.status = OpeningStockStatus.APPROVED;
        opening.failureReason = null;
        await manager.getRepository(OpeningStock).save(opening);
        return this.findOpeningForBusiness(manager, user.businessId, opening.id);
      });

      this.tenantJobService.appendLog(jobId, {
        row: 1,
        name: approved.openingNumber,
        status: 'success',
        metadata: { openingStockId: approved.id },
      });

      const completedJob = this.tenantJobService.completeJob(jobId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'OPENING_STOCK_APPROVED',
        description: `Opening stock ${approved.openingNumber} approved — stock received`,
        metadata: {
          openingStockId: approved.id,
          warehouseId: approved.warehouseId,
          jobId,
        },
      });

      await this.notifyJobCompletion(
        tenantDb,
        completedJob,
        user,
        tenantCode,
        'completed',
        'Opening stock approval completed',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown approval failure';

      await tenantDb.getRepository(OpeningStock).update(
        { id: openingId, businessId: user.businessId },
        {
          status: OpeningStockStatus.FAILED,
          failureReason: message,
        },
      );

      this.tenantJobService.appendLog(jobId, {
        row: 1,
        name: openingId,
        status: 'error',
        error: message,
      });
      this.tenantJobService.failJob(jobId);

      const failedJob = this.tenantJobService.getJobById(
        jobId,
        tenantCode,
        user.userId,
      );

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'OPENING_STOCK_APPROVE_FAILED',
        description: `Opening stock approval failed`,
        metadata: { openingStockId: openingId, jobId, error: message },
      });

      await this.notifyJobCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
        'Opening stock approval failed',
      );
    }
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    openingId: string,
    user: { userId: string; businessId?: string },
    tenantCode: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const actor = { userId: user.userId, businessId: scopedBusinessId };

    const opening = await this.findOpeningForBusiness(
      tenantDb,
      scopedBusinessId,
      openingId,
    );

    if (opening.status === OpeningStockStatus.APPROVED) {
      return {
        message: 'Opening stock is already approved',
        data: this.mapOpening(opening),
      };
    }

    if (opening.status === OpeningStockStatus.PROCESSING) {
      return {
        message: 'Opening stock approval is already in progress',
        jobId: opening.jobId,
        status: opening.status,
        data: this.mapOpening(opening),
      };
    }

    if (
      opening.status !== OpeningStockStatus.PENDING &&
      opening.status !== OpeningStockStatus.FAILED
    ) {
      throw new BadRequestException(
        'Only pending or failed opening stocks can be approved',
      );
    }

    if (!(opening.items ?? []).length) {
      throw new BadRequestException(
        'Opening stock must have at least one item to approve',
      );
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: scopedBusinessId,
      jobType: 'OPENING_STOCK_APPROVE',
      fileName: opening.openingNumber,
      createdBy: actor.userId,
      totalRows: 1,
    });

    opening.status = OpeningStockStatus.PROCESSING;
    opening.jobId = job.id;
    opening.failureReason = null;
    await tenantDb.getRepository(OpeningStock).save(opening);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actor.userId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_STARTED',
      description: `Opening stock approval started for ${opening.openingNumber}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        openingStockId: opening.id,
      },
    });

    void this.processApproveJob(
      tenantDb,
      job.id,
      opening.id,
      actor,
      tenantCode,
    );

    return {
      message: 'Opening stock approval started',
      jobId: job.id,
      status: job.status,
      data: this.mapOpening({
        ...opening,
        status: OpeningStockStatus.PROCESSING,
        jobId: job.id,
      }),
    };
  }

  async createAndApprove(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateOpeningStockDto,
    user: { userId: string; businessId?: string },
    tenantCode: string,
  ) {
    const created = await this.create(tenantDb, businessId, dto, user.userId);
    return this.approve(
      tenantDb,
      businessId,
      created.data.id,
      user,
      tenantCode,
    );
  }

  private sanitizeImportText(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return '';
    }
    return String(value).trim();
  }

  private parseImportNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeImportHeaderKey(key: string): string {
    return key.trim().toLowerCase().replace(/\s+/g, '');
  }

  private getImportRowValue(
    row: Record<string, unknown>,
    ...keys: string[]
  ): unknown {
    const normalizedRow = new Map<string, unknown>();
    for (const [key, value] of Object.entries(row)) {
      normalizedRow.set(this.normalizeImportHeaderKey(key), value);
    }
    for (const key of keys) {
      const value = normalizedRow.get(this.normalizeImportHeaderKey(key));
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private parseOpeningRowsFromFile(file: Express.Multer.File): OpeningImportRow[] {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
      throw new BadRequestException('Only CSV, XLS, and XLSX files are supported');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });

    const rows: OpeningImportRow[] = [];

    rawRows.forEach((row, index) => {
      const warehouseCode = this.sanitizeImportText(
        this.getImportRowValue(row, 'warehouseCode', 'warehouse'),
      );
      const productBarcode = this.sanitizeImportText(
        this.getImportRowValue(row, 'productBarcode', 'barcode'),
      );
      const productId = this.sanitizeImportText(
        this.getImportRowValue(row, 'productId'),
      );
      const productName = this.sanitizeImportText(
        this.getImportRowValue(row, 'productName', 'product', 'name'),
      );
      const uomName = this.sanitizeImportText(
        this.getImportRowValue(row, 'uomName', 'uom', 'measurementUnit'),
      );
      const uomId = this.sanitizeImportText(this.getImportRowValue(row, 'uomId'));
      const quantity = this.parseImportNumber(
        this.getImportRowValue(row, 'quantity', 'qty'),
      );
      const purchaseUnitPrice = this.parseImportNumber(
        this.getImportRowValue(
          row,
          'purchaseUnitPrice',
          'purchasePrice',
          'cost',
        ),
      );
      let saleUnitPrice = this.parseImportNumber(
        this.getImportRowValue(row, 'saleUnitPrice', 'salePrice'),
      );

      if (
        !warehouseCode ||
        warehouseCode.toLowerCase() === 'warehousecode' ||
        quantity === null ||
        purchaseUnitPrice === null
      ) {
        return;
      }

      if (saleUnitPrice === null) {
        saleUnitPrice = purchaseUnitPrice;
      }

      rows.push({
        row: index + 2,
        warehouseCode,
        productBarcode: productBarcode || null,
        productId: productId || null,
        productName: productName || null,
        uomName: uomName || null,
        uomId: uomId || null,
        quantity: this.roundQuantity(quantity),
        purchaseUnitPrice: this.roundAmount(purchaseUnitPrice),
        saleUnitPrice: this.roundAmount(saleUnitPrice),
        expiryDate:
          this.sanitizeImportText(
            this.getImportRowValue(row, 'expiryDate', 'expiry'),
          ) || null,
        notes:
          this.sanitizeImportText(this.getImportRowValue(row, 'notes')) || null,
        openingDate:
          this.sanitizeImportText(
            this.getImportRowValue(row, 'openingDate', 'date'),
          ) || null,
      });
    });

    return rows;
  }

  private async resolveImportProduct(
    manager: EntityManager,
    businessId: string,
    row: OpeningImportRow,
  ): Promise<Product> {
    if (row.productId) {
      return this.assertProductForBusiness(manager, businessId, row.productId);
    }

    if (row.productBarcode) {
      const byBarcode = await manager.getRepository(Product).findOne({
        where: {
          businessId,
          barcode: row.productBarcode,
          isDelete: false,
        },
      });
      if (byBarcode) {
        if (!byBarcode.isActive) {
          throw new BadRequestException(
            `Product barcode ${row.productBarcode} is inactive`,
          );
        }
        return byBarcode;
      }
    }

    if (row.productName) {
      const byName = await manager.getRepository(Product).findOne({
        where: {
          businessId,
          name: row.productName,
          isDelete: false,
        },
      });
      if (byName) {
        if (!byName.isActive) {
          throw new BadRequestException(
            `Product ${row.productName} is inactive`,
          );
        }
        return byName;
      }
    }

    throw new NotFoundException(
      'Product not found (need productId, productBarcode, or productName)',
    );
  }

  private async resolveImportUom(
    manager: EntityManager,
    businessId: string,
    row: OpeningImportRow,
  ): Promise<Uom> {
    if (row.uomId) {
      return this.assertUomForBusiness(manager, businessId, row.uomId);
    }

    if (row.uomName) {
      const uom = await manager
        .getRepository(Uom)
        .createQueryBuilder('uom')
        .where('uom.businessId = :businessId', { businessId })
        .andWhere('LOWER(uom.name) = LOWER(:name)', { name: row.uomName })
        .getOne();
      if (uom) {
        return uom;
      }
    }

    throw new NotFoundException('UOM not found (need uomId or uomName)');
  }

  private async processImportJob(
    tenantDb: DataSource,
    jobId: string,
    rows: OpeningImportRow[],
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);

    const grouped = new Map<string, OpeningImportRow[]>();
    for (const row of rows) {
      const dateKey = row.openingDate || '__default__';
      const key = `${row.warehouseCode}::${dateKey}`;
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
    }

    for (const groupRows of grouped.values()) {
      const first = groupRows[0];
      try {
        const opening = await tenantDb.transaction(async (manager) => {
          const warehouse = await manager.getRepository(Warehouse).findOne({
            where: {
              businessId: user.businessId,
              code: first.warehouseCode,
              deletedAt: IsNull(),
            },
          });
          if (!warehouse) {
            throw new NotFoundException(
              `Warehouse code ${first.warehouseCode} not found`,
            );
          }

          const resolvedItems: ResolvedOpeningLine[] = [];
          const seen = new Set<string>();

          for (const row of groupRows) {
            const product = await this.resolveImportProduct(
              manager,
              user.businessId,
              row,
            );
            const uom = await this.resolveImportUom(
              manager,
              user.businessId,
              row,
            );

            if (row.quantity <= 0) {
              throw new BadRequestException(
                `Row ${row.row}: quantity must be greater than zero`,
              );
            }

            const key = this.lineKey({
              productId: product.id,
              uomId: uom.id,
              productFlavourId: null,
            });
            if (seen.has(key)) {
              throw new BadRequestException(
                `Row ${row.row}: duplicate product/UOM in same warehouse group`,
              );
            }
            seen.add(key);

            resolvedItems.push({
              productId: product.id,
              productFlavourId: null,
              uomId: uom.id,
              quantity: row.quantity,
              purchaseUnitPrice: row.purchaseUnitPrice,
              saleUnitPrice: row.saleUnitPrice,
              expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
            });
          }

          const openingDate = first.openingDate
            ? new Date(first.openingDate)
            : new Date();

          const saved = await this.persistOpeningDocument(
            manager,
            user.businessId,
            user.userId,
            {
              warehouseId: warehouse.id,
              openingDate,
              notes: first.notes,
              items: resolvedItems,
              status: OpeningStockStatus.PROCESSING,
            },
          );

          await this.postOpeningStock(manager, saved);
          saved.status = OpeningStockStatus.APPROVED;
          saved.jobId = jobId;
          await manager.getRepository(OpeningStock).save(saved);

          return this.findOpeningForBusiness(
            manager,
            user.businessId,
            saved.id,
          );
        });

        for (const row of groupRows) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: `${row.warehouseCode}:${row.productBarcode || row.productName || row.productId}`,
            status: 'success',
            metadata: {
              openingStockId: opening.id,
              openingNumber: opening.openingNumber,
            },
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown import failure';
        for (const row of groupRows) {
          this.tenantJobService.appendLog(jobId, {
            row: row.row,
            name: `${row.warehouseCode}:${row.productBarcode || row.productName || row.productId}`,
            status: 'error',
            error: message,
          });
        }
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Opening stock import completed for ${completedJob.fileName}`,
      metadata: {
        jobId,
        jobType: completedJob.jobType,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        totalRows: completedJob.totalRows,
      },
    });

    await this.notifyJobCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
      'Opening stock import completed',
    );
  }

  async importOpeningStock(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId?: string },
    tenantCode: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(user.businessId);
    const actor = { userId: user.userId, businessId: scopedBusinessId };

    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    const rows = this.parseOpeningRowsFromFile(file);
    if (!rows.length) {
      throw new BadRequestException(
        'No opening stock rows found. Required columns: warehouseCode, quantity, purchaseUnitPrice, and productId or productBarcode or productName, plus uomId or uomName',
      );
    }

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: scopedBusinessId,
      jobType: 'OPENING_STOCK_IMPORT',
      fileName: file.originalname,
      createdBy: actor.userId,
      totalRows: rows.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actor.userId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_STARTED',
      description: `Opening stock import started for ${file.originalname}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: file.originalname,
        totalRows: rows.length,
      },
    });

    void this.processImportJob(tenantDb, job.id, rows, actor, tenantCode).catch(
      async (error) => {
        this.tenantJobService.failJob(job.id);
        this.tenantJobService.appendLog(job.id, {
          row: 0,
          name: '',
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Unknown processing failure',
        });

        const failedJob = this.tenantJobService.getJobById(
          job.id,
          tenantCode,
          actor.userId,
        );

        await this.activityLogService.recordActivityLog(tenantDb, {
          actorId: actor.userId,
          businessId: scopedBusinessId,
          action: 'TENANT_JOB_FAILED',
          description: `Opening stock import failed for ${file.originalname}`,
          metadata: {
            jobId: job.id,
            jobType: job.jobType,
            fileName: file.originalname,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        await this.notifyJobCompletion(
          tenantDb,
          failedJob,
          actor,
          tenantCode,
          'failed',
          'Opening stock import failed',
        );
      },
    );

    return {
      message: 'Opening stock import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
    };
  }
}
