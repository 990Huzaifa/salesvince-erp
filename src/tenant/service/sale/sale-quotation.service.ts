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
  SaleQuotation,
  SaleQuotationItem,
} from 'src/tenant-db/entities/sale-quotation.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import {
  Product,
  ProductPricing,
  Uom,
} from 'src/tenant-db/entities/product.entity';
import { CreateSaleQuotationDto } from '../../dto/sale-quotation/create-sale-quotation.dto';
import { CreateSaleQuotationItemDto } from '../../dto/sale-quotation/create-sale-quotation-item.dto';
import { UpdateSaleQuotationDto } from '../../dto/sale-quotation/update-sale-quotation.dto';
import { UpdateSaleQuotationItemDto } from '../../dto/sale-quotation/update-sale-quotation-item.dto';
import { ActivityLogService } from '../activity-log.service';

const QUOTATION_NUMBER_PREFIX = 'SQ';

@Injectable()
export class SaleQuotationService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async generateQuotationNumber(
    tenantDb: DataSource,
  ): Promise<string> {
    const last = await tenantDb
      .getRepository(SaleQuotation)
      .createQueryBuilder('sq')
      .where('sq.quotationNumber LIKE :prefix', {
        prefix: `${QUOTATION_NUMBER_PREFIX}-%`,
      })
      .orderBy('sq.quotationNumber', 'DESC')
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

  private async assertCustomerForBusiness(
    tenantDb: DataSource,
    businessId: string,
    customerId: string,
  ): Promise<Party> {
    const customer = await tenantDb.getRepository(Party).findOne({
      where: { id: customerId, businessId, deletedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (
      customer.type !== PartyType.CUSTOMER &&
      customer.type !== PartyType.BOTH
    ) {
      throw new BadRequestException('Party must be a customer');
    }

    return customer;
  }

  private async validateLineItems(
    manager: EntityManager,
    businessId: string,
    items: CreateSaleQuotationItemDto[],
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
    saleQuotationId: string,
    items: CreateSaleQuotationItemDto[],
  ): SaleQuotationItem[] {
    const itemRepo = manager.getRepository(SaleQuotationItem);
    return items.map((item) =>
      itemRepo.create({
        saleQuotationId,
        productId: item.productId,
        uomId: item.uomId,
        quantity: item.quantity,
      }),
    );
  }

  private async syncQuotationItems(
    manager: EntityManager,
    businessId: string,
    quotationId: string,
    items: UpdateSaleQuotationItemDto[],
    existingItems: SaleQuotationItem[],
  ): Promise<void> {
    await this.validateLineItems(manager, businessId, items);

    const itemRepo = manager.getRepository(SaleQuotationItem);
    const existingById = new Map(existingItems.map((row) => [row.id, row]));
    const keptItemIds = new Set<string>();

    for (const item of items) {
      if (item.id) {
        const existing = existingById.get(item.id);
        if (!existing || existing.saleQuotationId !== quotationId) {
          throw new NotFoundException(`Quotation item ${item.id} not found`);
        }
        keptItemIds.add(item.id);
        await itemRepo.update(existing.id, {
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
        });
        continue;
      }

      await itemRepo.save(
        itemRepo.create({
          saleQuotationId: quotationId,
          productId: item.productId,
          uomId: item.uomId,
          quantity: item.quantity,
        }),
      );
    }

    const idsToRemove = existingItems
      .filter((row) => !keptItemIds.has(row.id))
      .map((row) => row.id);

    if (idsToRemove.length > 0) {
      await itemRepo.delete({
        id: In(idsToRemove),
        saleQuotationId: quotationId,
      });
    }
  }

  private async saveQuotationHeader(
    manager: EntityManager,
    quotation: SaleQuotation,
  ): Promise<void> {
    await manager.getRepository(SaleQuotation).update(quotation.id, {
      quotationNumber: quotation.quotationNumber,
      customerId: quotation.customerId,
      quotationDate: quotation.quotationDate,
      notes: quotation.notes,
    });
  }

  private mapQuotation(quotation: SaleQuotation) {
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
      customerId: quotation.customerId,
      customer: quotation.customer
        ? {
            id: quotation.customer.id,
            code: quotation.customer.code,
            name: quotation.customer.name,
            type: quotation.customer.type,
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
      customer: true,
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
  ): Promise<SaleQuotation> {
    const quotation = await tenantDb
      .getRepository(SaleQuotation)
      .createQueryBuilder('sq')
      .innerJoin('sq.customer', 'customer')
      .leftJoinAndSelect('sq.customer', 'customerSelect')
      .leftJoinAndSelect('sq.createdByUser', 'createdByUser')
      .leftJoinAndSelect('sq.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('sq.id = :quotationId', { quotationId })
      .andWhere('customer.businessId = :businessId', { businessId })
      .getOne();

    if (!quotation) {
      throw new NotFoundException('Sale quotation not found');
    }

    return quotation;
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSaleQuotationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    await this.assertCustomerForBusiness(
      tenantDb,
      scopedBusinessId,
      dto.customerId,
    );

    const quotationNumber =
      dto.quotationNumber?.trim() ||
      (await this.generateQuotationNumber(tenantDb));

    const existingNumber = await tenantDb
      .getRepository(SaleQuotation)
      .findOne({ where: { quotationNumber } });

    if (existingNumber) {
      throw new ConflictException(
        'Sale quotation with this quotation number already exists',
      );
    }

    const created = await tenantDb.transaction(async (manager) => {
      await this.validateLineItems(manager, scopedBusinessId, dto.items);

      const quotation = await manager.getRepository(SaleQuotation).save(
        manager.getRepository(SaleQuotation).create({
          quotationNumber,
          customerId: dto.customerId,
          businessId: scopedBusinessId,
          quotationDate: new Date(dto.quotationDate),
          notes: dto.notes?.trim() || null,
          createdBy: actorUserId,
        }),
      );

      await manager
        .getRepository(SaleQuotationItem)
        .save(this.buildItemEntities(manager, quotation.id, dto.items));

      return manager.getRepository(SaleQuotation).findOneOrFail({
        where: { id: quotation.id },
        relations: this.quotationRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_QUOTATION_CREATED',
      description: `Sale quotation ${created.quotationNumber} created`,
      metadata: {
        saleQuotationId: created.id,
        quotationNumber: created.quotationNumber,
        customerId: created.customerId,
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
      customerId?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(SaleQuotation)
      .createQueryBuilder('sq')
      .innerJoinAndSelect('sq.customer', 'customer')
      .leftJoinAndSelect('sq.createdByUser', 'createdByUser')
      .leftJoinAndSelect('sq.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('sq.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.customerId) {
      qb.andWhere('sq.customerId = :customerId', {
        customerId: options.customerId,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('sq.quotationNumber ILIKE :search', { search })
            .orWhere('customer.name ILIKE :search', { search })
            .orWhere('customer.code ILIKE :search', { search });
        }),
      );
    }

    const [quotations, total] = await qb
      .orderBy('sq.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_QUOTATION_LISTED',
      description: 'Sale quotations listed',
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
      action: 'SALE_QUOTATION_VIEWED',
      description: `Sale quotation ${quotation.quotationNumber} viewed`,
      metadata: { saleQuotationId: quotation.id },
    });

    return { data: this.mapQuotation(quotation) };
  }

  async update(
    tenantDb: DataSource,
    businessId: string | undefined,
    quotationId: string,
    dto: UpdateSaleQuotationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const quotation = await this.findQuotationForBusiness(
      tenantDb,
      scopedBusinessId,
      quotationId,
    );

    if (dto.customerId !== undefined) {
      await this.assertCustomerForBusiness(
        tenantDb,
        scopedBusinessId,
        dto.customerId,
      );
      quotation.customerId = dto.customerId;
    }

    if (dto.quotationNumber !== undefined) {
      const nextNumber = dto.quotationNumber.trim();
      if (!nextNumber) {
        throw new BadRequestException('Quotation number cannot be empty');
      }
      if (nextNumber !== quotation.quotationNumber) {
        const taken = await tenantDb
          .getRepository(SaleQuotation)
          .findOne({ where: { quotationNumber: nextNumber } });
        if (taken) {
          throw new ConflictException(
            'Sale quotation with this quotation number already exists',
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

    const existingItems = [...(quotation.items ?? [])];

    const updated = await tenantDb.transaction(async (manager) => {
      if (dto.items !== undefined) {
        await this.syncQuotationItems(
          manager,
          scopedBusinessId,
          quotation.id,
          dto.items,
          existingItems,
        );
      }

      await this.saveQuotationHeader(manager, quotation);

      return manager.getRepository(SaleQuotation).findOneOrFail({
        where: { id: quotation.id },
        relations: this.quotationRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_QUOTATION_UPDATED',
      description: `Sale quotation ${updated.quotationNumber} updated`,
      metadata: { saleQuotationId: updated.id },
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

    await tenantDb.getRepository(SaleQuotation).remove(quotation);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_QUOTATION_DELETED',
      description: `Sale quotation ${quotation.quotationNumber} deleted`,
      metadata: { saleQuotationId: quotation.id },
    });

    return {
      message: 'Sale quotation deleted',
      data: { id: quotation.id, quotationNumber: quotation.quotationNumber },
    };
  }
}
