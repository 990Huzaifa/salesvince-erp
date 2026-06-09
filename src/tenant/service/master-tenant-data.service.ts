import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LIMIT_KEY } from 'src/master-db/entities/plan.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { Status, Subscription } from 'src/master-db/entities/subscription.entity';
import { Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { TenantModule } from 'src/master-db/entities/tenant-modules.entity';

export type TenantPlanLimit = {
  limitKey: LIMIT_KEY;
  limitValue: number;
};

@Injectable()
export class MasterTenantDataService {
  constructor(
    @InjectRepository(TenantSettings)
    private readonly tenantSettingsRepo: Repository<TenantSettings>,
    @InjectRepository(TenantGeoPolicy)
    private readonly tenantGeoPolicyRepo: Repository<TenantGeoPolicy>,
    @InjectRepository(TenantTheme)
    private readonly tenantThemeRepo: Repository<TenantTheme>,
    @InjectRepository(TenantModule)
    private readonly tenantModuleRepo: Repository<TenantModule>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async getTenantSettingsByTenantId(tenantId?: string | null): Promise<TenantSettings | null> {
    if (!tenantId?.trim()) {
      return null;
    }

    return this.tenantSettingsRepo.findOne({
      where: { tenant: { id: tenantId.trim() } },
    });
  }

  async getTenantGeoPolicyByTenantId(tenantId?: string | null): Promise<TenantGeoPolicy | null> {
    if (!tenantId?.trim()) {
      return null;
    }

    return this.tenantGeoPolicyRepo.findOne({
      where: { tenant: { id: tenantId.trim() } },
    });
  }

  async getTenantThemeByTenantId(tenantId?: string | null): Promise<TenantTheme | null> {
    if (!tenantId?.trim()) {
      return null;
    }

    return this.tenantThemeRepo.findOne({
      where: { tenant: { id: tenantId.trim() } },
    });
  }

  async getTenantCodeByTenantId(tenantId?: string | null): Promise<string | null> {
    if (!tenantId?.trim()) {
      return null;
    }
    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId.trim() },
    });
    if (!tenant) {
      return null;
    }
    return tenant.code;

  }

  async getTenantModulesByTenantId(tenantId?: string | null){
    if (!tenantId?.trim()) {
      return null;
    }
    const modules = await this.tenantModuleRepo.find({
      where: { tenant: { id: tenantId.trim() } },
      relations: ['module'],
    });
    if (!modules) {
      return [];
    }
    return modules;
  }

  async getTenantLimitsByTenantId(tenantId?: string | null): Promise<TenantPlanLimit[]> {
    if (!tenantId?.trim()) {
      return [];
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: { tenant: { id: tenantId.trim() }, status: Status.ACTIVE },
      relations: ['plan', 'plan.plan_limits'],
    });

    if (!subscription?.plan?.plan_limits?.length) {
      return [];
    }

    return subscription.plan.plan_limits.map(({ limitKey, limitValue }) => ({
      limitKey,
      limitValue,
    }));
  }

  async getBackupRetentionLimit(tenantId?: string | null): Promise<number> {
    const limits = await this.getTenantLimitsByTenantId(tenantId);
    const backupLimit = limits.find((l) => l.limitKey === LIMIT_KEY.DAILY_BACKUP);
    if (!backupLimit || backupLimit.limitValue <= 0) {
      return 0;
    }
    return backupLimit.limitValue;
  }

  async tenantHasBackupFeature(tenantId?: string | null): Promise<boolean> {
    return (await this.getBackupRetentionLimit(tenantId)) > 0;
  }

  async getTenantMasterDataByTenantId(tenantId?: string | null) {
    if (!tenantId?.trim()) {
      return {
        modules: [],
        tenantCode: null,
        settings: null,
        geoPolicy: null,
        theme: null,
        limits: [],
      };
    }

    const normalizedTenantId = tenantId.trim();

    const [tenantCode, settings, geoPolicy, theme, modules, limits] = await Promise.all([
      this.getTenantCodeByTenantId(normalizedTenantId),
      this.getTenantSettingsByTenantId(normalizedTenantId),
      this.getTenantGeoPolicyByTenantId(normalizedTenantId),
      this.getTenantThemeByTenantId(normalizedTenantId),
      this.getTenantModulesByTenantId(normalizedTenantId),
      this.getTenantLimitsByTenantId(normalizedTenantId),
    ]);

    return {
      tenantCode,
      settings,
      geoPolicy,
      theme,
      modules,
      limits,
    };
  }
}
