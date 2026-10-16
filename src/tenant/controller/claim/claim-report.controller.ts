import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ClaimReportBaseQueryDto } from '../../dto/claim/claim-report.query.dto';
import { ClaimReportService } from '../../service/claim/claim-report.service';

@Controller('tenant/claim-reports')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class ClaimReportController {
  constructor(private readonly claimReportService: ClaimReportService) {}

  @Get('pipeline')
  @RequirePermissions('LIST_CLAIM')
  pipeline(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.pipeline(tenantDb, user.businessId, query);
  }

  @Get('balances')
  @RequirePermissions('LIST_CLAIM')
  balances(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.balances(tenantDb, user.businessId, query);
  }

  @Get('aging')
  @RequirePermissions('LIST_CLAIM')
  aging(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.aging(tenantDb, user.businessId, query);
  }

  @Get('vendor-performance')
  @RequirePermissions('LIST_CLAIM')
  vendorPerformance(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.vendorPerformance(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('customer-settlement')
  @RequirePermissions('LIST_CLAIM')
  customerSettlement(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.customerSettlement(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('discard-loss')
  @RequirePermissions('LIST_CLAIM')
  discardLoss(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.discardLoss(tenantDb, user.businessId, query);
  }

  @Get('additional-costs')
  @RequirePermissions('LIST_CLAIM')
  additionalCosts(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.additionalCosts(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('kpi')
  @RequirePermissions('LIST_CLAIM')
  kpi(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.kpi(tenantDb, user.businessId, query);
  }

  @Get('claim-stock')
  @RequirePermissions('LIST_CLAIM_STOCK')
  claimStock(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.claimReportService.claimStockSummary(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('registers/:docType')
  @RequirePermissions('LIST_CLAIM')
  register(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Param('docType') docType: string,
    @Query() query: ClaimReportBaseQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    const allowed = ['shipments', 'receipts', 'discards', 'fulfillments'] as const;
    if (!allowed.includes(docType as (typeof allowed)[number])) {
      throw new BadRequestException(
        'docType must be one of: shipments | receipts | discards | fulfillments',
      );
    }
    return this.claimReportService.register(
      tenantDb,
      user.businessId,
      docType as (typeof allowed)[number],
      query,
    );
  }
}
