import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, ILike } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { Service } from 'src/tenant-db/entities/service.entity';
import { createChartOfAccountForService } from 'src/tenant-db/helpers/service-chart-of-account.helper';
import { ActivityLogService } from './activity-log.service';
import { generateSequentialCode } from './hr/hr-common.util';
import { CreateServiceDto } from '../dto/service/create-service.dto';
import { UpdateServiceDto } from '../dto/service/update-service.dto';

const SERVICE_CODE_PREFIX = 'SRV';

@Injectable()
export class ServiceMasterService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private parseStatus(status: unknown): boolean {
    if (typeof status === 'boolean') {
      return status;
    }
    if (status === 'true' || status === '1') {
      return true;
    }
    if (status === 'false' || status === '0') {
      return false;
    }
    throw new BadRequestException('status must be true or false');
  }

  private async ensureNameUnique(
    tenantDb: DataSource,
    businessId: string,
    name: string,
    excludeId?: string,
  ) {
    const qb = tenantDb
      .getRepository(Service)
      .createQueryBuilder('service')
      .where('service.businessId = :businessId', { businessId })
      .andWhere('service.isDelete = false')
      .andWhere('LOWER(service.name) = LOWER(:name)', { name });
    if (excludeId) {
      qb.andWhere('service.id != :excludeId', { excludeId });
    }
    if (await qb.getOne()) {
      throw new ConflictException('Service with this name already exists');
    }
  }

  async create(tenantDb: DataSource, dto: CreateServiceDto, user: any) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Service name is required');
    }
    await this.ensureNameUnique(tenantDb, user.businessId, name);

    const created = await tenantDb.transaction(async (manager) => {
      const serviceRepo = manager.getRepository(Service);
      const code = await generateSequentialCode(
        manager.connection,
        Service,
        'service',
        'code',
        SERVICE_CODE_PREFIX,
      );

      const service = await serviceRepo.save(
        serviceRepo.create({
          businessId: user.businessId,
          code,
          name,
          description: dto.description?.trim() || null,
          saleUnitPrice: dto.saleUnitPrice,
          isActive: dto.isActive,
          isDelete: false,
          createdBy: user.userId ?? null,
        }),
      );

      await createChartOfAccountForService(manager, service);
      return service;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'SERVICE_CREATED',
      description: `Service ${created.name} (${created.code}) created`,
      metadata: {
        serviceId: created.id,
        code: created.code,
        chartOfAccountId: created.chartOfAccountId,
      },
    });

    return this.view(tenantDb, created.id, user, false);
  }

  async list(
    tenantDb: DataSource,
    page: number,
    limit: number,
    search: string,
    user: any,
  ) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 200);
    const term = search?.trim();

    const baseWhere = { businessId: user.businessId, isDelete: false };
    const where = term
      ? [
          { ...baseWhere, name: ILike(`%${term}%`) },
          { ...baseWhere, code: ILike(`%${term}%`) },
        ]
      : baseWhere;

    const [services, total] = await tenantDb
      .getRepository(Service)
      .findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'SERVICE_LISTED',
      description: 'Services listed',
      metadata: { total, page: safePage, limit: safeLimit },
    });

    return {
      result: services,
      meta: { total, page: safePage, limit: safeLimit },
    };
  }

  async view(tenantDb: DataSource, id: string, user: any, log = true) {
    const service = await tenantDb.getRepository(Service).findOne({
      where: { id, businessId: user.businessId, isDelete: false },
      relations: { chartOfAccount: true },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (log) {
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: user.businessId,
        action: 'SERVICE_VIEWED',
        description: `Service ${service.name} viewed`,
        metadata: { serviceId: service.id },
      });
    }

    return service;
  }

  async edit(
    tenantDb: DataSource,
    id: string,
    dto: UpdateServiceDto,
    user: any,
  ) {
    const serviceRepo = tenantDb.getRepository(Service);
    const service = await serviceRepo.findOne({
      where: { id, businessId: user.businessId, isDelete: false },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    let nameChanged = false;
    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Service name is required');
      }
      if (nextName !== service.name) {
        await this.ensureNameUnique(
          tenantDb,
          user.businessId,
          nextName,
          service.id,
        );
        service.name = nextName;
        nameChanged = true;
      }
    }
    if (dto.description !== undefined) {
      service.description = dto.description?.trim() || null;
    }
    if (dto.saleUnitPrice !== undefined) {
      service.saleUnitPrice = dto.saleUnitPrice;
    }
    if (dto.isActive !== undefined) {
      service.isActive = dto.isActive;
    }

    await tenantDb.transaction(async (manager) => {
      await manager.getRepository(Service).save(service);

      if (nameChanged) {
        const coaRepo = manager.getRepository(ChartOfAccount);
        const accountName = `${service.name} (${service.code})`;
        if (service.chartOfAccountId) {
          await coaRepo.update(
            { id: service.chartOfAccountId, businessId: service.businessId },
            { name: accountName },
          );
        } else {
          await createChartOfAccountForService(manager, service);
        }
      }
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'SERVICE_UPDATED',
      description: `Service ${service.name} updated`,
      metadata: { serviceId: service.id, businessId: service.businessId },
    });

    return this.view(tenantDb, service.id, user, false);
  }

  async updateStatus(
    tenantDb: DataSource,
    id: string,
    status: unknown,
    user: any,
  ) {
    const isActive = this.parseStatus(status);
    const serviceRepo = tenantDb.getRepository(Service);
    const service = await serviceRepo.findOne({
      where: { id, businessId: user.businessId, isDelete: false },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    service.isActive = isActive;
    await serviceRepo.save(service);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: user.businessId,
      action: 'SERVICE_STATUS_UPDATED',
      description: `Service ${service.name} status updated to ${isActive}`,
      metadata: { serviceId: service.id, status: isActive },
    });

    return {
      message: 'Service status updated successfully',
      service: {
        id: service.id,
        code: service.code,
        name: service.name,
        status: service.isActive,
      },
    };
  }
}
