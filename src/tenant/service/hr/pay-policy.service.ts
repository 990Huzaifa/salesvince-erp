import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, In } from 'typeorm';
import { ChartOfAccount } from 'src/tenant-db/entities/chart-of-account.entity';
import {
  PayPolicy,
  PayPolicyComponent,
  SalaryComponent,
} from 'src/tenant-db/entities/hr';
import { CreatePayPolicyDto } from '../../dto/hr/pay-policy/create-pay-policy.dto';
import { UpdatePayPolicyDto } from '../../dto/hr/pay-policy/update-pay-policy.dto';
import { PayPolicyComponentItemDto } from '../../dto/hr/shared/pay-policy-component-item.dto';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  assertUniqueField,
  IsNull,
  slugifyCode,
} from './hr-common.util';

@Injectable()
export class PayPolicyService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private mapPolicyComponent(row: PayPolicyComponent) {
    return {
      id: row.id,
      salaryComponentId: row.salaryComponentId,
      calculationType: row.calculationType,
      value: row.value != null ? Number(row.value) : null,
      basedOnComponentId: row.basedOnComponentId,
      formula: row.formula,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      salaryComponent: row.salaryComponent
        ? {
            id: row.salaryComponent.id,
            name: row.salaryComponent.name,
            code: row.salaryComponent.code,
            componentType: row.salaryComponent.componentType,
          }
        : null,
    };
  }

  private mapPayPolicy(policy: PayPolicy, includeComponents = false) {
    return {
      id: policy.id,
      businessId: policy.businessId,
      name: policy.name,
      code: policy.code,
      description: policy.description,
      payrollType: policy.payrollType,
      payCycle: policy.payCycle,
      salaryCalculationType: policy.salaryCalculationType,
      workingDaysType: policy.workingDaysType,
      fixedWorkingDays: policy.fixedWorkingDays,
      workingHoursPerDay:
        policy.workingHoursPerDay != null
          ? Number(policy.workingHoursPerDay)
          : null,
      currency: policy.currency,
      overtimeAllowed: policy.overtimeAllowed,
      overtimeRateType: policy.overtimeRateType,
      overtimeRate:
        policy.overtimeRate != null ? Number(policy.overtimeRate) : null,
      lateDeductionAllowed: policy.lateDeductionAllowed,
      absentDeductionAllowed: policy.absentDeductionAllowed,
      halfDayDeductionAllowed: policy.halfDayDeductionAllowed,
      taxApplicable: policy.taxApplicable,
      providentFundApplicable: policy.providentFundApplicable,
      eobiApplicable: policy.eobiApplicable,
      socialSecurityApplicable: policy.socialSecurityApplicable,
      expenseAccountId: policy.expenseAccountId,
      payableAccountId: policy.payableAccountId,
      isDefault: policy.isDefault,
      isActive: policy.isActive,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      components:
        includeComponents && policy.payPolicyComponents
          ? policy.payPolicyComponents.map((c) => this.mapPolicyComponent(c))
          : undefined,
    };
  }

  private async findForBusiness(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    withComponents = false,
  ): Promise<PayPolicy> {
    const row = await tenantDb.getRepository(PayPolicy).findOne({
      where: { id, businessId, deletedAt: IsNull() },
      relations: withComponents
        ? {
            payPolicyComponents: {
              salaryComponent: true,
            },
          }
        : undefined,
    });
    if (!row) {
      throw new NotFoundException('Pay policy not found');
    }
    if (row.payPolicyComponents) {
      row.payPolicyComponents.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return row;
  }

  private async assertAccount(
    tenantDb: DataSource,
    businessId: string,
    accountId?: string | null,
  ): Promise<void> {
    if (!accountId) return;
    const account = await tenantDb.getRepository(ChartOfAccount).findOne({
      where: { id: accountId, businessId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException('Chart of account not found');
    }
  }

  private async clearDefaultFlag(
    tenantDb: DataSource,
    businessId: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = tenantDb
      .getRepository(PayPolicy)
      .createQueryBuilder()
      .update(PayPolicy)
      .set({ isDefault: false })
      .where('businessId = :businessId', { businessId })
      .andWhere('isDefault = true')
      .andWhere('deletedAt IS NULL');
    if (excludeId) {
      qb.andWhere('id != :excludeId', { excludeId });
    }
    await qb.execute();
  }

  private async validateComponentItems(
    tenantDb: DataSource,
    businessId: string,
    items?: PayPolicyComponentItemDto[],
  ): Promise<void> {
    if (!items?.length) return;

    const ids = [...new Set(items.map((i) => i.salaryComponentId))];
    const found = await tenantDb.getRepository(SalaryComponent).find({
      where: { id: In(ids), businessId, deletedAt: IsNull() },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('One or more salary components are invalid');
    }
  }

  private async syncComponents(
    tenantDb: DataSource,
    businessId: string,
    payPolicyId: string,
    items: PayPolicyComponentItemDto[],
  ): Promise<void> {
    const repo = tenantDb.getRepository(PayPolicyComponent);
    const existing = await repo.find({
      where: { payPolicyId, businessId, deletedAt: IsNull() },
    });

    for (const row of existing) {
      await repo.softRemove(row);
    }

    let sortOrder = 0;
    for (const item of items) {
      await repo.save(
        repo.create({
          businessId,
          payPolicyId,
          salaryComponentId: item.salaryComponentId,
          calculationType: item.calculationType,
          value: item.value ?? null,
          basedOnComponentId: item.basedOnComponentId ?? null,
          formula: item.formula?.trim() ?? null,
          sortOrder: item.sortOrder ?? sortOrder,
          isActive: item.isActive ?? true,
        }),
      );
      sortOrder += 1;
    }
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePayPolicyDto,
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
      PayPolicy,
      'p',
      scopedBusinessId,
      'name',
      name,
      undefined,
      'Pay policy',
    );
    await assertUniqueField(
      tenantDb,
      PayPolicy,
      'p',
      scopedBusinessId,
      'code',
      code,
      undefined,
      'Pay policy',
    );

    await this.assertAccount(tenantDb, scopedBusinessId, dto.expenseAccountId);
    await this.assertAccount(tenantDb, scopedBusinessId, dto.payableAccountId);
    await this.validateComponentItems(
      tenantDb,
      scopedBusinessId,
      dto.components,
    );

    if (dto.isDefault) {
      await this.clearDefaultFlag(tenantDb, scopedBusinessId);
    }

    const created = await tenantDb.getRepository(PayPolicy).save(
      tenantDb.getRepository(PayPolicy).create({
        businessId: scopedBusinessId,
        name,
        code,
        description: dto.description?.trim() ?? null,
        payrollType: dto.payrollType,
        payCycle: dto.payCycle,
        salaryCalculationType: dto.salaryCalculationType,
        workingDaysType: dto.workingDaysType,
        fixedWorkingDays: dto.fixedWorkingDays ?? null,
        workingHoursPerDay: dto.workingHoursPerDay ?? null,
        currency: dto.currency?.trim() || 'PKR',
        overtimeAllowed: dto.overtimeAllowed ?? false,
        overtimeRateType: dto.overtimeRateType ?? null,
        overtimeRate: dto.overtimeRate ?? null,
        lateDeductionAllowed: dto.lateDeductionAllowed ?? false,
        absentDeductionAllowed: dto.absentDeductionAllowed ?? true,
        halfDayDeductionAllowed: dto.halfDayDeductionAllowed ?? true,
        taxApplicable: dto.taxApplicable ?? false,
        providentFundApplicable: dto.providentFundApplicable ?? false,
        eobiApplicable: dto.eobiApplicable ?? false,
        socialSecurityApplicable: dto.socialSecurityApplicable ?? false,
        expenseAccountId: dto.expenseAccountId ?? null,
        payableAccountId: dto.payableAccountId ?? null,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
      }),
    );

    if (dto.components?.length) {
      await this.syncComponents(
        tenantDb,
        scopedBusinessId,
        created.id,
        dto.components,
      );
    }

    const full = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      created.id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAY_POLICY_CREATED',
      description: `Pay policy ${full.name} created`,
      metadata: { payPolicyId: full.id },
    });

    return { data: this.mapPayPolicy(full, true) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      isActive?: boolean;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);

    const qb = tenantDb
      .getRepository(PayPolicy)
      .createQueryBuilder('p')
      .where('p.businessId = :businessId', { businessId: scopedBusinessId })
      .andWhere('p.deletedAt IS NULL');

    if (options.isActive !== undefined) {
      qb.andWhere('p.isActive = :isActive', { isActive: options.isActive });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('p.name ILIKE :search', { search })
            .orWhere('p.code ILIKE :search', { search });
        }),
      );
    }

    const [rows, total] = await qb
      .orderBy('p.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAY_POLICY_LISTED',
      description: 'Pay policies listed',
      metadata: { total, page, limit },
    });

    return {
      data: rows.map((row) => this.mapPayPolicy(row)),
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
    const row = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAY_POLICY_VIEWED',
      description: `Pay policy ${row.name} viewed`,
      metadata: { payPolicyId: row.id },
    });

    return { data: this.mapPayPolicy(row, true) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: UpdatePayPolicyDto,
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
          PayPolicy,
          'p',
          scopedBusinessId,
          'name',
          nextName,
          row.id,
          'Pay policy',
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
          PayPolicy,
          'p',
          scopedBusinessId,
          'code',
          nextCode,
          row.id,
          'Pay policy',
        );
        row.code = nextCode;
      }
    }

    if (dto.description !== undefined) {
      row.description = dto.description?.trim() ?? null;
    }
    if (dto.payrollType !== undefined) row.payrollType = dto.payrollType;
    if (dto.payCycle !== undefined) row.payCycle = dto.payCycle;
    if (dto.salaryCalculationType !== undefined) {
      row.salaryCalculationType = dto.salaryCalculationType;
    }
    if (dto.workingDaysType !== undefined) {
      row.workingDaysType = dto.workingDaysType;
    }
    if (dto.fixedWorkingDays !== undefined) {
      row.fixedWorkingDays = dto.fixedWorkingDays;
    }
    if (dto.workingHoursPerDay !== undefined) {
      row.workingHoursPerDay = dto.workingHoursPerDay;
    }
    if (dto.currency !== undefined) row.currency = dto.currency.trim();
    if (dto.overtimeAllowed !== undefined) {
      row.overtimeAllowed = dto.overtimeAllowed;
    }
    if (dto.overtimeRateType !== undefined) {
      row.overtimeRateType = dto.overtimeRateType;
    }
    if (dto.overtimeRate !== undefined) row.overtimeRate = dto.overtimeRate;
    if (dto.lateDeductionAllowed !== undefined) {
      row.lateDeductionAllowed = dto.lateDeductionAllowed;
    }
    if (dto.absentDeductionAllowed !== undefined) {
      row.absentDeductionAllowed = dto.absentDeductionAllowed;
    }
    if (dto.halfDayDeductionAllowed !== undefined) {
      row.halfDayDeductionAllowed = dto.halfDayDeductionAllowed;
    }
    if (dto.taxApplicable !== undefined) row.taxApplicable = dto.taxApplicable;
    if (dto.providentFundApplicable !== undefined) {
      row.providentFundApplicable = dto.providentFundApplicable;
    }
    if (dto.eobiApplicable !== undefined) row.eobiApplicable = dto.eobiApplicable;
    if (dto.socialSecurityApplicable !== undefined) {
      row.socialSecurityApplicable = dto.socialSecurityApplicable;
    }
    if (dto.expenseAccountId !== undefined) {
      await this.assertAccount(tenantDb, scopedBusinessId, dto.expenseAccountId);
      row.expenseAccountId = dto.expenseAccountId;
    }
    if (dto.payableAccountId !== undefined) {
      await this.assertAccount(tenantDb, scopedBusinessId, dto.payableAccountId);
      row.payableAccountId = dto.payableAccountId;
    }
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.isDefault !== undefined) {
      if (dto.isDefault) {
        await this.clearDefaultFlag(tenantDb, scopedBusinessId, row.id);
      }
      row.isDefault = dto.isDefault;
    }

    await tenantDb.getRepository(PayPolicy).save(row);

    if (dto.components !== undefined) {
      await this.validateComponentItems(
        tenantDb,
        scopedBusinessId,
        dto.components,
      );
      await this.syncComponents(
        tenantDb,
        scopedBusinessId,
        row.id,
        dto.components,
      );
    }

    const full = await this.findForBusiness(
      tenantDb,
      scopedBusinessId,
      row.id,
      true,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PAY_POLICY_UPDATED',
      description: `Pay policy ${full.name} updated`,
      metadata: { payPolicyId: full.id },
    });

    return { data: this.mapPayPolicy(full, true) };
  }
}
