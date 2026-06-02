import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ForecastCategoriesQueryDto } from '../dto/inventory/forecast/forecast-categories.query.dto';
import { ForecastInsightsQueryDto } from '../dto/inventory/forecast/forecast-insights.query.dto';
import { ForecastOverviewQueryDto } from '../dto/inventory/forecast/forecast-overview.query.dto';
import { ForecastProductDetailQueryDto } from '../dto/inventory/forecast/forecast-product-detail.query.dto';
import { InventoryForecastService } from '../service/inventory/forecast/inventory-forecast.service';

@Controller('tenant/inventory/forecast')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class InventoryForecastController {
  constructor(
    private readonly inventoryForecastService: InventoryForecastService,
  ) {}

  @Get('overview')
  @RequirePermissions('LIST_INVENTORY_FORECAST')
  overview(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ForecastOverviewQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryForecastService.getOverview(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('insights/products')
  @RequirePermissions('LIST_INVENTORY_FORECAST')
  insightProducts(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ForecastInsightsQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryForecastService.listInsightProducts(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('categories')
  @RequirePermissions('LIST_INVENTORY_FORECAST')
  categories(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query() query: ForecastCategoriesQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryForecastService.listCategories(
      tenantDb,
      user.businessId,
      query,
    );
  }

  @Get('categories/:categoryId/products')
  @RequirePermissions('LIST_INVENTORY_FORECAST')
  categoryProducts(
    @TenantConnection() tenantDb: DataSource,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Req() req: Request,
    @Query() query: ForecastCategoriesQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryForecastService.listCategoryProducts(
      tenantDb,
      user.businessId,
      categoryId,
      query,
    );
  }

  @Get('products/:productId')
  @RequirePermissions('LIST_INVENTORY_FORECAST')
  productDetail(
    @TenantConnection() tenantDb: DataSource,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: Request,
    @Query() query: ForecastProductDetailQueryDto,
  ) {
    const user = req.user as TenantRequestUser;
    return this.inventoryForecastService.getProductDetail(
      tenantDb,
      user.businessId,
      productId,
      query,
    );
  }
}
