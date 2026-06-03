import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantId } from 'src/common/tenant/tenant-connection.decorator';
import { MasterTenantDataService } from '../service/master-tenant-data.service';

@Controller('tenant/master-data')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard)
export class MasterTenantDataController {
  constructor(private readonly masterTenantDataService: MasterTenantDataService) {}

  @Get('')
  async getTenantMasterData(@TenantId() tenantId: string) {
    return this.masterTenantDataService.getTenantMasterDataByTenantId(tenantId);
  }
}
