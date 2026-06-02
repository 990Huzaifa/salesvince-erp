import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import { SalaryComponent } from 'src/tenant-db/entities/hr';
import { CreateSalaryComponentDto } from '../../dto/hr/salary-component/create-salary-component.dto';
import { UpdateSalaryComponentDto } from '../../dto/hr/salary-component/update-salary-component.dto';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  assertUniqueField,
  IsNull,
  slugifyCode,
} from './hr-common.util';

@Injectable()
export class SalaryComponentService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapComponent(component: SalaryComponent) {
    return {
      id: component.id,
      businessId: component.businessId,
      name: component.name,
      code: component.code,
      componentType: component.componentType,
      calculationType: component.calculationType,
      defaultValue:
        component.defaultValue != null ? Number(component.defaultValue) : null,
      isTaxable: component.isTaxable,
      isRequired: component.isRequired,
      accountId: component.accountId,
      isActive: component.isActive,
      createdAt: component.createdAt,
      updatedAt: component.updatedAt,
    };
  }

  private async findForBusiness(
    tenantDb: DataSource,
    businessId: string,
    id: string,
  ): Promise<SalaryComponent> {
    const row = await tenantDb.getRepository(SalaryComponent).findOne({
      where: { id, businessId, deletedAt: IsNull() },
    });
    if (!row) {
      throw new NotFoundException('Salary component not found');
    }
    return row;
  }

  private async assertAccount(
    tenantDb: DataSource,
    businessId: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) return;
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateSalaryComponentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const name = dto.name.trim();
    const code = dto.code?.trim()
      ? slugifyCode(dto.code)
      : slugifyCode(name);
    if (!name || !code) {
      throw new BadRequestException('Name and code are required');
    }

    await assertUniqueField(
      tenantDb,
      SalaryComponent,
      'c',
      scopedBusinessId,
      'name',
      name,
      undefined,
      'Salary component',
    );
    await assertUniqueField(
      tenantDb,
      SalaryComponent,
      'c',
      scopedBusinessId,
      'code',
      code,
      undefined,
      'Salary component',
    );
    await this.assertAccount(tenantDb, scopedBusinessId, dto.accountId);

    const created = await tenantDb.getRepository(SalaryComponent).save(
      tenantDb.getRepository(SalaryComponent).create({
        businessId: scopedBusinessId,
        name,
        code,
        componentType: dto.componentType,
        calculationType: dto.calculationType,
        defaultValue: dto.defaultValue ?? null,
        isTaxable: dto.isTaxable ?? false,
        isRequired: dto.isRequired ?? false,
        accountId: dto.accountId ?? null,
        isActive: dto.isActive ?? true,
      }),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALARY_COMPONENT_CREATED',
      description: `Salary component ${created.name} created`,
      metadata: { salaryComponentId: created.id },
    });

    return { data: this.mapComponent(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      componentType?: string;
      isActive?: boolean;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);

    const qb = tenantDb
      .getRepository(SalaryComponent)
      .createQueryBuilder('c')
      .where('c.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('c.deletedAt IS NULL');

    if (options.componentType) {
      qb.andWhere('c.componentType = :componentType', {
        componentType: options.componentType,
      });
    }
    if (options.isActive !== undefined) {
      qb.andWhere('c.isActive = :isActive', { isActive: options.isActive });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('c.name ILIKE :search', { search })
            .orWhere('c.code ILIKE :search', { search });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('c.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALARY_COMPONENT_LISTED',
      description: 'Salary components listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapComponent(row)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const row = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALARY_COMPONENT_VIEWED',
      description: `Salary component ${row.name} viewed`,
      metadata: { salaryComponentId: row.id },
    });

    return { data: this.mapComponent(row) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: UpdateSalaryComponentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const row = await this.findForBusiness(tenantDb, scopedBusinessId, id);

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Name cannot be empty');
      }
      if (nextName !== row.name) {
        await assertUniqueField(
          tenantDb,
          SalaryComponent,
          'c',
          scopedBusinessId,
          'name',
          nextName,
          row.id,
          'Salary component',
        );
        row.name = nextName;
      }
    }

    if (dto.code !== undefined) {
      const nextCode = slugifyCode(dto.code);
      if (!nextCode) {
        throw new BadRequestException('Code cannot be empty');
      }
      if (nextCode !== row.code) {
        await assertUniqueField(
          tenantDb,
          SalaryComponent,
          'c',
          scopedBusinessId,
          'code',
          nextCode,
          row.id,
          'Salary component',
        );
        row.code = nextCode;
      }
    }

    if (dto.componentType !== undefined) row.componentType = dto.componentType;
    if (dto.calculationType !== undefined) {
      row.calculationType = dto.calculationType;
    }
    if (dto.defaultValue !== undefined) row.defaultValue = dto.defaultValue;
    if (dto.isTaxable !== undefined) row.isTaxable = dto.isTaxable;
    if (dto.isRequired !== undefined) row.isRequired = dto.isRequired;
    if (dto.accountId !== undefined) {
      await this.assertAccount(tenantDb, scopedBusinessId, dto.accountId);
      row.accountId = dto.accountId;
    }
    if (dto.isActive !== undefined) row.isActive = dto.isActive;

    const updated = await tenantDb.getRepository(SalaryComponent).save(row);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALARY_COMPONENT_UPDATED',
      description: `Salary component ${updated.name} updated`,
      metadata: { salaryComponentId: updated.id },
    });

    return { data: this.mapComponent(updated) };
  }
}
