import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { CreateWarehouseDto } from '../dto/warehouse/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/warehouse/update-warehouse.dto';
import { ActivityLogService } from './activity-log.service';

@Injectable()
export class WarehouseService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private mapWarehouse(warehouse: Warehouse) {
    return {
      id: warehouse.id,
      businessId: warehouse.businessId,
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      cityId: warehouse.cityId,
      stateId: warehouse.stateId,
      countryId: warehouse.countryId,
      zipCode: warehouse.zipCode,
      phone: warehouse.phone,
      email: warehouse.email,
      website: warehouse.website,
      contactPersonName: warehouse.contactPersonName,
      contactPersonPhone: warehouse.contactPersonPhone,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    };
  }

  private async findWarehouseForBusiness(
    tenantDb: DataSource,
    businessId: string,
    warehouseId: string,
  ): Promise<Warehouse> {
    const warehouse = await tenantDb.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  private async assertCodeAvailable(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = tenantDb
      .getRepository(Warehouse)
      .createQueryBuilder('w')
      .where('w.businessId = :businessId', { businessId })
      .andWhere('w.code = :code', { code })
      .andWhere('w.deletedAt IS NULL');

    if (excludeId) {
      qb.andWhere('w.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Warehouse with this code already exists');
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateWarehouseDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const code = dto.code.trim();

    await this.assertCodeAvailable(tenantDb, scopedBusinessId, code);

    const warehouse = tenantDb.getRepository(Warehouse).create({
      businessId: scopedBusinessId,
      name: dto.name.trim(),
      code,
      address: dto.address.trim(),
      cityId: dto.cityId,
      stateId: dto.stateId,
      countryId: dto.countryId,
      zipCode: dto.zipCode?.trim() ?? null,
      phone: dto.phone?.trim() ?? null,
      email: dto.email?.trim() ?? null,
      website: dto.website?.trim() ?? null,
      contactPersonName: dto.contactPersonName?.trim() ?? null,
      contactPersonPhone: dto.contactPersonPhone?.trim() ?? null,
    });

    const created = await tenantDb.getRepository(Warehouse).save(warehouse);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'WAREHOUSE_CREATED',
      description: `Warehouse ${created.name} created`,
      metadata: { warehouseId: created.id, code: created.code },
    });

    return { data: this.mapWarehouse(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      cityId?: string;
      stateId?: string;
      countryId?: string;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(Warehouse)
      .createQueryBuilder('w')
      .where('w.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('w.deletedAt IS NULL');

    if (options.cityId) {
      qb.andWhere('w.cityId = :cityId', { cityId: options.cityId });
    }

    if (options.stateId) {
      qb.andWhere('w.stateId = :stateId', { stateId: options.stateId });
    }

    if (options.countryId) {
      qb.andWhere('w.countryId = :countryId', {
        countryId: options.countryId,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('w.name ILIKE :search', { search })
            .orWhere('w.code ILIKE :search', { search })
            .orWhere('w.address ILIKE :search', { search })
            .orWhere('w.email ILIKE :search', { search })
            .orWhere('w.phone ILIKE :search', { search })
            .orWhere('w.contactPersonName ILIKE :search', { search });
        }),
      );
    }

    const [warehouses, total] = await qb
      .orderBy('w.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'WAREHOUSE_LISTED',
      description: 'Warehouses listed',
      metadata: { total, page, limit },
    });

    return {
      data: warehouses.map((warehouse) => this.mapWarehouse(warehouse)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    warehouseId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const warehouse = await this.findWarehouseForBusiness(
      tenantDb,
      scopedBusinessId,
      warehouseId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'WAREHOUSE_VIEWED',
      description: `Warehouse ${warehouse.name} viewed`,
      metadata: { warehouseId: warehouse.id },
    });

    return { data: this.mapWarehouse(warehouse) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    warehouseId: string,
    dto: UpdateWarehouseDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const warehouse = await this.findWarehouseForBusiness(
      tenantDb,
      scopedBusinessId,
      warehouseId,
    );

    if (dto.code !== undefined) {
      const nextCode = dto.code.trim();
      if (!nextCode) {
        throw new BadRequestException('Warehouse code cannot be empty');
      }
      if (nextCode !== warehouse.code) {
        await this.assertCodeAvailable(
          tenantDb,
          scopedBusinessId,
          nextCode,
          warehouse.id,
        );
        warehouse.code = nextCode;
      }
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Warehouse name cannot be empty');
      }
      warehouse.name = nextName;
    }

    if (dto.address !== undefined) {
      const nextAddress = dto.address.trim();
      if (!nextAddress) {
        throw new BadRequestException('Warehouse address cannot be empty');
      }
      warehouse.address = nextAddress;
    }

    if (dto.cityId !== undefined) warehouse.cityId = dto.cityId;
    if (dto.stateId !== undefined) warehouse.stateId = dto.stateId;
    if (dto.countryId !== undefined) warehouse.countryId = dto.countryId;
    if (dto.zipCode !== undefined)
      warehouse.zipCode = dto.zipCode?.trim() ?? null;
    if (dto.phone !== undefined) warehouse.phone = dto.phone?.trim() ?? null;
    if (dto.email !== undefined) warehouse.email = dto.email?.trim() ?? null;
    if (dto.website !== undefined)
      warehouse.website = dto.website?.trim() ?? null;
    if (dto.contactPersonName !== undefined)
      warehouse.contactPersonName = dto.contactPersonName?.trim() ?? null;
    if (dto.contactPersonPhone !== undefined)
      warehouse.contactPersonPhone = dto.contactPersonPhone?.trim() ?? null;

    const updated = await tenantDb.getRepository(Warehouse).save(warehouse);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'WAREHOUSE_UPDATED',
      description: `Warehouse ${updated.name} updated`,
      metadata: { warehouseId: updated.id, code: updated.code },
    });

    return { data: this.mapWarehouse(updated) };
  }
}
