import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { DashboardService } from '../service/dashboard.service';
import { DashboardDateRangeQueryDto } from '../dto/dashboard/dashboard-date-range.query.dto';
import { SaleAnalyticsQueryDto } from '../dto/dashboard/sale-analytics.query.dto';
import { ThingsToReviewQueryDto } from '../dto/dashboard/things-to-review.query.dto';
import { SaleByProductQueryDto } from '../dto/dashboard/sale-by-product.query.dto';
import { LowPaymentCustomersQueryDto } from '../dto/dashboard/low-payment-customers.query.dto';

@Controller('tenant/dashboard')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('things-to-review')
  getThingsToReview(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ThingsToReviewQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.dashboardService.getThingsToReview(
      tenantDb,
      user.businessId,
      query.limit ?? 50,
    );
  }

  @Get('summary')
  getSummary(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.dashboardService.getSummary(
      tenantDb,
      user.businessId,
      user.userId,
    );
  }

  @Get('charts')
  getCharts(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: DashboardDateRangeQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.dashboardService.getCharts(tenantDb, user.businessId, {
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('sale-analytics')
  getSaleAnalytics(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: SaleAnalyticsQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.dashboardService.getSaleAnalytics(tenantDb, user.businessId, {
      date: query.date,
      graph_filter: query.graph_filter ?? 'daily',
    });
  }

  @Get('sale-by-product')
  getSaleByProduct(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: SaleByProductQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.dashboardService.getSaleByProduct(tenantDb, user.businessId, {
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit ?? 10,
    });
  }

  @Get('low-payment-customers')
  getLowPaymentCustomers(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: LowPaymentCustomersQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.dashboardService.getLowPaymentCustomers(
      tenantDb,
      user.businessId,
      user.userId,
      query.limit ?? 10,
    );
  }
}
