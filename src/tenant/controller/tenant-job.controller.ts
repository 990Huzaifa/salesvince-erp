import { Controller, Get, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantCode } from 'src/common/tenant/tenant-connection.decorator';
import { TenantJobService } from '../service/tenant-job.service';

type TenantRequestUser = {
  userId?: string;
};

@Controller('tenant/jobs')
@UseGuards(TenantJwtAuthGuard, TenantJwtGuard, TenantConnectionGuard, TenantPermissionGuard)
export class TenantJobController {
  constructor(private readonly tenantJobService: TenantJobService) {}

  private getUserId(req: Request): string {
    const user = req.user as TenantRequestUser;
    if (!user?.userId) {
      throw new UnauthorizedException('Tenant user not found in request');
    }
    return user.userId;
  }

  @Get('')
  listMyJobs(@TenantCode() tenantCode: string, @Req() req: Request) {
    return this.tenantJobService.listJobsForUser(tenantCode, this.getUserId(req));
  }

  @Get(':jobId')
  getJobById(
    @TenantCode() tenantCode: string,
    @Param('jobId') jobId: string,
    @Req() req: Request,
  ) {
    return this.tenantJobService.getJobById(jobId, tenantCode, this.getUserId(req));
  }
}
