import { Injectable } from '@nestjs/common';
import {
  resolvePrintThemeColors,
  type PrintThemeColors,
} from 'src/common/pdf';
import { MasterTenantDataService } from './master-tenant-data.service';

@Injectable()
export class PrintThemeService {
  constructor(
    private readonly masterTenantDataService: MasterTenantDataService,
  ) {}

  async resolveForTenant(
    tenantId?: string | null,
  ): Promise<PrintThemeColors> {
    const theme =
      await this.masterTenantDataService.getTenantThemeByTenantId(tenantId);
    return resolvePrintThemeColors(theme);
  }
}
