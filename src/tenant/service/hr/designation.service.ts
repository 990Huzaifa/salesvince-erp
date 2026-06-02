import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, IsNull } from 'typeorm';
import { Designation } from 'src/tenant-db/entities/hr';
import { CreateDesignationDto } from '../../dto/hr/designation/create-designation.dto';
import { UpdateDesignationDto } from '../../dto/hr/designation/update-designation.dto';
import { ActivityLogService } from '../activity-log.service';

@Injectable()
export class DesignationService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private slugifyCode(value: string): string {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }

  private mapDesignation(designation: Designation) {
    return {
      id: designation.id,
      businessId: designation.businessId,
      departmentId: designation.departmentId,
      name: designation.name,
      code: designation.code,
      level: designation.level,
      description: designation.description,
      isActive: designation.isActive,
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

  private async assertUniqueField(
    tenantDb: DataSource,
    businessId: string,
    field: 'name' | 'code',
    value: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = tenantDb
      .getRepository(Designation)
      .createQueryBuilder('d')
      .where('d.businessId = :businessId', { businessId })
      .andWhere(`LOWER(d.${field}) = LOWER(:value)`, { value })
      .andWhere('d.deletedAt IS NULL');

    if (excludeId) {
      qb.andWhere('d.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Designation with this ${field} already exists`,
      );
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateDesignationDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Designation name cannot be empty');
    }

    const code = dto.code?.trim()
      ? this.slugifyCode(dto.code)
      : this.slugifyCode(name);
    if (!code) {
      throw new BadRequestException('Designation code cannot be empty');
    }

    await this.assertUniqueField(tenantDb, scopedBusinessId, 'name', name);
    await this.assertUniqueField(tenantDb, scopedBusinessId, 'code', code);

    const created = await tenantDb.getRepository(Designation).save(
      tenantDb.getRepository(Designation).create({
        name,
        code,
        departmentId: dto.departmentId ?? null,
        level: dto.level ?? null,
        description: dto.description?.trim() ?? null,
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
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(Designation)
      .createQueryBuilder('d')
      .where('d.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('d.deletedAt IS NULL');

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('d.name ILIKE :search', { search })
            .orWhere('d.code ILIKE :search', { search });
        }),
      );
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
    const scopedBusinessId = this.assertBusinessId(businessId);
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
    const scopedBusinessId = this.assertBusinessId(businessId);
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
        await this.assertUniqueField(
          tenantDb,
          scopedBusinessId,
          'name',
          nextName,
          designation.id,
        );
        designation.name = nextName;
      }
    }

    if (dto.code !== undefined) {
      const nextCode = this.slugifyCode(dto.code);
      if (!nextCode) {
        throw new BadRequestException('Designation code cannot be empty');
      }
      if (nextCode !== designation.code) {
        await this.assertUniqueField(
          tenantDb,
          scopedBusinessId,
          'code',
          nextCode,
          designation.id,
        );
        designation.code = nextCode;
      }
    }

    if (dto.departmentId !== undefined) {
      designation.departmentId = dto.departmentId;
    }

    if (dto.level !== undefined) {
      designation.level = dto.level;
    }

    if (dto.description !== undefined) {
      designation.description = dto.description?.trim() ?? null;
    }

    if (dto.isActive !== undefined) {
      designation.isActive = dto.isActive;
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
