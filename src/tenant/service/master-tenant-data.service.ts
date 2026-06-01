import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { Repository } from 'typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { TenantModule } from 'src/master-db/entities/tenant-modules.entity';

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

  async getTenantMasterDataByTenantId(tenantId?: string | null) {
    if (!tenantId?.trim()) {
      return {
        modules: [],
        tenantCode: null,
        settings: null,
        geoPolicy: null,
        theme: null,
      };
    }

    const normalizedTenantId = tenantId.trim();

    const [tenantCode, settings, geoPolicy, theme, modules] = await Promise.all([
      this.getTenantCodeByTenantId(normalizedTenantId),
      this.getTenantSettingsByTenantId(normalizedTenantId),
      this.getTenantGeoPolicyByTenantId(normalizedTenantId),
      this.getTenantThemeByTenantId(normalizedTenantId),
      this.getTenantModulesByTenantId(normalizedTenantId),
    ]);

    return {
      tenantCode,
      settings,
      geoPolicy,
      theme,
      modules,
    };
  }
}
