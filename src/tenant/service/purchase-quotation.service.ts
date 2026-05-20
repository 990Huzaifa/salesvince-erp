import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Brackets,
  DataSource,
  EntityManager,
  In,
  IsNull,
} from 'typeorm';
import {
  PurchaseQuotation,
  PurchaseQuotationItem,
} from 'src/tenant-db/entities/purchase-quotation.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  Product,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { CreatePurchaseQuotationDto } from '../dto/purchase-quotation/create-purchase-quotation.dto';
import { CreatePurchaseQuotationItemDto } from '../dto/purchase-quotation/create-purchase-quotation-item.dto';
import { UpdatePurchaseQuotationDto } from '../dto/purchase-quotation/update-purchase-quotation.dto';
import { ActivityLogService } from './activity-log.service';

const QUOTATION_NUMBER_PREFIX = 'PQ';

@Injectable()
export class PurchaseQuotationService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private computeLineTotal(quantity: number, unitPrice: number): number {
    return quantity * unitPrice;
  }

  private async generateQuotationNumber(
    tenantDb: DataSource,
  ): Promise<string> {
    const last = await tenantDb
      .getRepository(PurchaseQuotation)
      .createQueryBuilder('pq')
      .where('pq.quotationNumber LIKE :prefix', {
        prefix: `${QUOTATION_NUMBER_PREFIX}-%`,
      })
      .orderBy('pq.quotationNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.quotationNumber.replace(
        `${QUOTATION_NUMBER_PREFIX}-`,
        '',
      );
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${QUOTATION_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertVendorForBusiness(
    tenantDb: DataSource,
    businessId: string,
    vendorId: string,
  ): Promise<Party> {
    const vendor = await tenantDb.getRepository(Party).findOne({
      where: { id: vendorId, businessId, deletedAt: IsNull() },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (vendor.type !== PartyType.VENDOR && vendor.type !== PartyType.BOTH) {
      throw new BadRequestException('Party must be a vendor');
    }

    return vendor;
  }

  private async validateLineItems(
    manager: EntityManager,
    businessId: string,
    items: CreatePurchaseQuotationItemDto[],
  ): Promise<void> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const uomIds = [...new Set(items.map((item) => item.uomId))];

    const products = await manager.getRepository(Product).find({
      where: { id: In(productIds), businessId, isDelete: false },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }

    const uoms = await manager.getRepository(Uom).find({
      where: { id: In(uomIds), businessId },
    });

    if (uoms.length !== uomIds.length) {
      throw new NotFoundException('One or more UOMs were not found');
    }

    for (const item of items) {
      const pricing = await manager.getRepository(ProductPricing).findOne({
        where: { productId: item.productId, uomId: item.uomId },
      });

      if (!pricing) {
        throw new BadRequestException(
          `Product ${item.productId} has no pricing for UOM ${item.uomId}`,
        );
      }
    }
  }

  private buildItemEntities(
    manager: EntityManager,
    purchaseQuotationId: string,
    items: CreatePurchaseQuotationItemDto[],
  ): PurchaseQuotationItem[] {
    const itemRepo = manager.getRepository(PurchaseQuotationItem);
    return items.map((item) =>
      itemRepo.create({
        purchaseQuotationId,
        productId: item.productId,
        uomId: item.uomId,
        quantity: item.quantity,
      }),
    );
  }

  private mapQuotation(quotation: PurchaseQuotation) {
    const items = (quotation.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            skuCode: item.product.skuCode,
          }
        : null,
      uomId: item.uomId,
      uom: item.uom
        ? {
            id: item.uom.id,
            name: item.uom.name,
          }
        : null,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return {
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      vendorId: quotation.vendorId,
      vendor: quotation.vendor
        ? {
            id: quotation.vendor.id,
            code: quotation.vendor.code,
            name: quotation.vendor.name,
            type: quotation.vendor.type,
          }
        : null,
      quotationDate: quotation.quotationDate,
      notes: quotation.notes,
      createdBy: quotation.createdBy,
      createdByUser: quotation.createdByUser
        ? {
            id: quotation.createdByUser.id,
            name: quotation.createdByUser.name,
            email: quotation.createdByUser.email,
          }
        : null,
      items,
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    };
  }

  private quotationRelations() {
    return {
      vendor: true,
      createdByUser: true,
      items: {
        product: true,
        uom: true,
      },
    } as const;
  }

  private async findQuotationForBusiness(
    tenantDb: DataSource,
    businessId: string,
    quotationId: string,
  ): Promise<PurchaseQuotation> {
    const quotation = await tenantDb
      .getRepository(PurchaseQuotation)
      .createQueryBuilder('pq')
      .innerJoin('pq.vendor', 'vendor')
      .leftJoinAndSelect('pq.vendor', 'vendorSelect')
      .leftJoinAndSelect('pq.createdByUser', 'createdByUser')
      .leftJoinAndSelect('pq.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('pq.id = :quotationId', { quotationId })
      .andWhere('vendor.businessId = :businessId', { businessId })
      .getOne();

    if (!quotation) {
      throw new NotFoundException('Purchase quotation not found');
    }

    return quotation;
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePurchaseQuotationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    await this.assertVendorForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.vendorId,
    );

    const quotationNumber =
      dto.quotationNumber?.trim() ||
      (await this.generateQuotationNumber(tenantDb));

    const existingNumber = await tenantDb
      .getRepository(PurchaseQuotation)
      .findOne({ where: { quotationNumber } });

    if (existingNumber) {
      throw new ConflictException(
        'Purchase quotation with this quotation number already exists',
      );
    }

    const created = await tenantDb.transaction(async (manager) => {
      await this.validateLineItems(manager, scopedBusinessId, dto.items);

      const quotation = await manager.getRepository(PurchaseQuotation).save(
        manager.getRepository(PurchaseQuotation).create({
          quotationNumber,
          vendorId: dto.vendorId,
          quotationDate: new Date(dto.quotationDate),
          notes: dto.notes?.trim() || null,
          createdBy: actorUserId,
        }),
      );

      await manager
        .getRepository(PurchaseQuotationItem)
        .save(this.buildItemEntities(manager, quotation.id, dto.items));

      return manager.getRepository(PurchaseQuotation).findOneOrFail({
        where: { id: quotation.id },
        relations: this.quotationRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_QUOTATION_CREATED',
      description: `Purchase quotation ${created.quotationNumber} created`,
      metadata: {
        purchaseQuotationId: created.id,
        quotationNumber: created.quotationNumber,
        vendorId: created.vendorId,
      },
    });

    return { data: this.mapQuotation(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      vendorId?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(PurchaseQuotation)
      .createQueryBuilder('pq')
      .innerJoinAndSelect('pq.vendor', 'vendor')
      .leftJoinAndSelect('pq.createdByUser', 'createdByUser')
      .leftJoinAndSelect('pq.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('vendor.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.vendorId) {
      qb.andWhere('pq.vendorId = :vendorId', { vendorId: options.vendorId });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('pq.quotationNumber ILIKE :search', { search })
            .orWhere('vendor.name ILIKE :search', { search })
            .orWhere('vendor.code ILIKE :search', { search });
        }),
      );
    }

    const [quotations, total] = await qb
      .orderBy('pq.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_QUOTATION_LISTED',
      description: 'Purchase quotations listed',
      metadata: { total, page, limit },
    });

    return {
      data: quotations.map((quotation) => this.mapQuotation(quotation)),
      meta: { total, page, limit },
    };
  }

  async getById(
    tenantDb: DataSource,
    businessId: string | undefined,
    quotationId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const quotation = await this.findQuotationForBusiness(
      tenantDb,
      scopedBusinessId,
      quotationId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_QUOTATION_VIEWED',
      description: `Purchase quotation ${quotation.quotationNumber} viewed`,
      metadata: { purchaseQuotationId: quotation.id },
    });

    return { data: this.mapQuotation(quotation) };
  }

  async update(
    tenantDb: DataSource,
    businessId: string | undefined,
    quotationId: string,
    dto: UpdatePurchaseQuotationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const quotation = await this.findQuotationForBusiness(
      tenantDb,
      scopedBusinessId,
      quotationId,
    );

    if (dto.vendorId !== undefined) {
      await this.assertVendorForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.vendorId,
      );
      quotation.vendorId = dto.vendorId;
    }

    if (dto.quotationNumber !== undefined) {
      const nextNumber = dto.quotationNumber.trim();
      if (!nextNumber) {
        throw new BadRequestException('Quotation number cannot be empty');
      }
      if (nextNumber !== quotation.quotationNumber) {
        const taken = await tenantDb
          .getRepository(PurchaseQuotation)
          .findOne({ where: { quotationNumber: nextNumber } });
        if (taken) {
          throw new ConflictException(
            'Purchase quotation with this quotation number already exists',
          );
        }
        quotation.quotationNumber = nextNumber;
      }
    }

    if (dto.quotationDate !== undefined) {
      quotation.quotationDate = new Date(dto.quotationDate);
    }

    if (dto.notes !== undefined) {
      quotation.notes = dto.notes?.trim() || null;
    }

    const updated = await tenantDb.transaction(async (manager) => {
      if (dto.items !== undefined) {
        await this.validateLineItems(manager, scopedBusinessId, dto.items);
        await manager
          .getRepository(PurchaseQuotationItem)
          .delete({ purchaseQuotationId: quotation.id });
        await manager
          .getRepository(PurchaseQuotationItem)
          .save(this.buildItemEntities(manager, quotation.id, dto.items));
      }

      await manager.getRepository(PurchaseQuotation).save(quotation);

      return manager.getRepository(PurchaseQuotation).findOneOrFail({
        where: { id: quotation.id },
        relations: this.quotationRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_QUOTATION_UPDATED',
      description: `Purchase quotation ${updated.quotationNumber} updated`,
      metadata: { purchaseQuotationId: updated.id },
    });

    return { data: this.mapQuotation(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    quotationId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const quotation = await this.findQuotationForBusiness(
      tenantDb,
      scopedBusinessId,
      quotationId,
    );

    await tenantDb.getRepository(PurchaseQuotation).remove(quotation);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_QUOTATION_DELETED',
      description: `Purchase quotation ${quotation.quotationNumber} deleted`,
      metadata: { purchaseQuotationId: quotation.id },
    });

    return {
      message: 'Purchase quotation deleted',
      data: { id: quotation.id, quotationNumber: quotation.quotationNumber },
    };
  }
}
