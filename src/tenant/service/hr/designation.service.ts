import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Designation } from 'src/tenant-db/entities/hr';
import { CreateDesignationDto } from '../../dto/hr/designation/create-designation.dto';
import { UpdateDesignationDto } from '../../dto/hr/designation/update-designation.dto';
import { ActivityLogService } from '../activity-log.service';
import { assertBusinessId } from './hr-common.util';

@Injectable()
export class DesignationService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapDesignation(designation: Designation) {
    return {
      id: designation.id,
      businessId: designation.businessId,
      name: designation.name,
      createdAt: designation.createdAt,
      updatedAt: designation.updatedAt,
    };
  }

  private async findDesignationForBusiness(
    tenantDb: DataSource,
    businessId: string,
    designationId: string,
  ): Promise<Designation> {
    const designation = await tenantDb.getRepository(Designation).findOne({
      where: { id: designationId, businessId, deletedAt: IsNull() },
    });

    if (!designation) {
      throw new NotFoundException('Designation not found');
    }

    return designation;
  }

  private async assertNameAvailable(
    tenantDb: DataSource,
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = tenantDb
      .getRepository(Designation)
      .createQueryBuilder('d')
      .where('d.businessId = :businessId', { businessId })
      .andWhere('LOWER(d.name) = LOWER(:name)', { name })
      .andWhere('d.deletedAt IS NULL');

    if (excludeId) {
      qb.andWhere('d.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Designation with this name already exists');
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateDesignationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Designation name cannot be empty');
    }

    await this.assertNameAvailable(tenantDb, scopedBusinessId, name);

    const created = await tenantDb.getRepository(Designation).save(
      tenantDb.getRepository(Designation).create({
        name,
        businessId: scopedBusinessId,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DESIGNATION_CREATED',
      description: `Designation ${created.name} created`,
      metadata: { designationId: created.id },
    });

    return { data: this.mapDesignation(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: { page: number; limit: number; search?: string },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(Designation)
      .createQueryBuilder('d')
      .where('d.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('d.deletedAt IS NULL');

    if (options.search?.trim()) {
      qb.andWhere('d.name ILIKE :search', {
        search: `%${options.search.trim()}%`,
      });
    }

    const [designations, total] = await qb
      .orderBy('d.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DESIGNATION_LISTED',
      description: 'Designations listed',
      metadata: { total, page, limit },
    });

    return {
      data: designations.map((designation) => this.mapDesignation(designation)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    designationId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const designation = await this.findDesignationForBusiness(
      tenantDb,
      scopedBusinessId,
      designationId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DESIGNATION_VIEWED',
      description: `Designation ${designation.name} viewed`,
      metadata: { designationId: designation.id },
    });

    return { data: this.mapDesignation(designation) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    designationId: string,
    dto: UpdateDesignationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const designation = await this.findDesignationForBusiness(
      tenantDb,
      scopedBusinessId,
      designationId,
    );

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Designation name cannot be empty');
      }
      if (nextName !== designation.name) {
        await this.assertNameAvailable(
          tenantDb,
          scopedBusinessId,
          nextName,
          designation.id,
        );
        designation.name = nextName;
      }
    }

    const updated = await tenantDb.getRepository(Designation).save(designation);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DESIGNATION_UPDATED',
      description: `Designation ${updated.name} updated`,
      metadata: { designationId: updated.id },
    });

    return { data: this.mapDesignation(updated) };
  }
}
