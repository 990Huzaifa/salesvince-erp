import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Department } from 'src/tenant-db/entities/hr';
import { CreateDepartmentDto } from '../../dto/hr/department/create-department.dto';
import { UpdateDepartmentDto } from '../../dto/hr/department/update-department.dto';
import { ActivityLogService } from '../activity-log.service';
import { assertBusinessId } from './hr-common.util';

@Injectable()
export class DepartmentService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapDepartment(department: Department) {
    return {
      id: department.id,
      businessId: department.businessId,
      name: department.name,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };
  }

  private async findDepartmentForBusiness(
    tenantDb: DataSource,
    businessId: string,
    departmentId: string,
  ): Promise<Department> {
    const department = await tenantDb.getRepository(Department).findOne({
      where: { id: departmentId, businessId, deletedAt: IsNull() },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  private async assertNameAvailable(
    tenantDb: DataSource,
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = tenantDb
      .getRepository(Department)
      .createQueryBuilder('d')
      .where('d.businessId = :businessId', { businessId })
      .andWhere('LOWER(d.name) = LOWER(:name)', { name })
      .andWhere('d.deletedAt IS NULL');

    if (excludeId) {
      qb.andWhere('d.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException('Department with this name already exists');
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateDepartmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Department name cannot be empty');
    }

    await this.assertNameAvailable(tenantDb, scopedBusinessId, name);

    const created = await tenantDb.getRepository(Department).save(
      tenantDb.getRepository(Department).create({
        name,
        businessId: scopedBusinessId,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DEPARTMENT_CREATED',
      description: `Department ${created.name} created`,
      metadata: { departmentId: created.id },
    });

    return { data: this.mapDepartment(created) };
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
      .getRepository(Department)
      .createQueryBuilder('d')
      .where('d.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('d.deletedAt IS NULL');

    if (options.search?.trim()) {
      qb.andWhere('d.name ILIKE :search', {
        search: `%${options.search.trim()}%`,
      });
    }

    const [departments, total] = await qb
      .orderBy('d.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DEPARTMENT_LISTED',
      description: 'Departments listed',
      metadata: { total, page, limit },
    });

    return {
      data: departments.map((department) => this.mapDepartment(department)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    departmentId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const department = await this.findDepartmentForBusiness(
      tenantDb,
      scopedBusinessId,
      departmentId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DEPARTMENT_VIEWED',
      description: `Department ${department.name} viewed`,
      metadata: { departmentId: department.id },
    });

    return { data: this.mapDepartment(department) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    departmentId: string,
    dto: UpdateDepartmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const department = await this.findDepartmentForBusiness(
      tenantDb,
      scopedBusinessId,
      departmentId,
    );

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Department name cannot be empty');
      }
      if (nextName !== department.name) {
        await this.assertNameAvailable(
          tenantDb,
          scopedBusinessId,
          nextName,
          department.id,
        );
        department.name = nextName;
      }
    }

    const updated = await tenantDb.getRepository(Department).save(department);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'DEPARTMENT_UPDATED',
      description: `Department ${updated.name} updated`,
      metadata: { departmentId: updated.id },
    });

    return { data: this.mapDepartment(updated) };
  }
}
