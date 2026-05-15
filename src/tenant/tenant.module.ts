import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { City } from 'src/master-db/entities/city.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { TenantModule as TenantModuleEntity } from 'src/master-db/entities/tenant-modules.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantActivityLogController } from './controller/tenant-activity-log.controller';
import { TenantDesignationController } from './controller/tenant-designation.controller';
import { TenantNotificationController } from './controller/tenant-notification.controller';
import { DistributorController } from './controller/distributor.controller';
import { AreaController } from './controller/area.controller';
import { FlavourController } from './controller/flavour.controller';
import { ProductBrandController } from './controller/product-brand.controller';
import { ProductCategoryController } from './controller/product-category.controller';
import { ProductController } from './controller/product.controller';
import { PjpController } from './controller/pjp.controller';
import { RegionController } from './controller/region.controller';
import { RouteController } from './controller/route.controller';
import { TenantRoleController } from './controller/tenant-role.controller';
import { TenantUserController } from './controller/tenant-user.controller';
import { UomController } from './controller/uom.controller';
import { TenantJobController } from './controller/tenant-job.controller';
import { OpeningStockController } from './controller/opening-stock.controller';
import { ProductPricingJobController } from './controller/product-pricing-job.controller';
import { PurchaseStockController } from './controller/purchase-stock.controller';
import { MasterTenantDataController } from './controller/master-tenant-data.controller';
import { StockTransferController } from './controller/stock-transfer.controller';
import { RetailerCategoryController } from './controller/retailer-category.controller';
import { RetailerChannelController } from './controller/retailer-channel.controller';
import { RetailerController } from './controller/retailer.controller';
import { SchemeController } from './controller/scheme.controller';
import { StockController } from './controller/stock.controller';
import { SaleOrderController } from './controller/saleorder.controller';
import { SaleVoucherController } from './controller/sale-voucher.controller';
import { TenantAuthService } from './service/tenant-auth.service';
import { ActivityLogService } from './service/activity-log.service';
import { TenantDesignationService } from './service/tenant-designation.service';
import { NotificationService } from './service/notification.service';
import { DistributorService } from './service/distributor.service';
import { AreaService } from './service/area.service';
import { FlavourService } from './service/flavour.service';
import { ProductBrandService } from './service/product-brand.service';
import { ProductCategoryService } from './service/product-category.service';
import { ProductService } from './service/product.service';
import { PjpService } from './service/pjp.service';
import { RegionService } from './service/region.service';
import { RouteService } from './service/route.service';
import { TenantRoleService } from './service/tenant-role.service';
import { UomService } from './service/uom.service';
import { UserService } from './service/user.service';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { TenantUtilityController } from './controller/utility.controller';
import { MailModule } from 'src/common/mail/mail.module';
import { CommonModule } from 'src/common/common.module';
import { TenantUtilityService } from './service/tenant-utility.service';
import { MasterGeoHelperService } from './service/master-geo-helper.service';
import { PusherService } from 'src/common/pusher/pusher.service';
import { TenantJobService } from './service/tenant-job.service';
import { OpeningStockService } from './service/opening-stock.service';
import { StockService } from './service/stock.service';
import { ProductPricingJobService } from './service/product-pricing-job.service';
import { PurchaseStockService } from './service/purchase-stock.service';
import { MasterTenantDataService } from './service/master-tenant-data.service';
import { StockTransferService } from './service/stock-transfer.service';
import { RetailerCategoryService } from './service/retailer-category.service';
import { RetailerChannelService } from './service/retailer-channel.service';
import { RetailerService } from './service/retailer.service';
import { AssetController } from './controller/asset.controller';
import { AssetService } from './service/asset.service';
import { SchemeService } from './service/scheme.service';
import { StockImportService } from './service/stock-import.service';
import { RetailerSchemeEngineService } from './service/retailer-scheme-engine.service';
import { ProductSchemeEngineService } from './service/product-scheme-engine.service';
import { SaleOrderService } from './service/saleorder.service';
import { SaleVoucherService } from './service/sale-voucher.service';
import { RetailerLedgerService } from './service/retailer-ledger.service';


@Module({
  imports: [
    HttpModule,
    AuthModule,
    MailModule,
    CommonModule,
    TenantRuntimeModule,
    TypeOrmModule.forFeature([
      Tenant,
      Country,
      State,
      City,
      TenantSettings,
      TenantGeoPolicy,
      TenantTheme,
      TenantModuleEntity
    ]),
  ],
  controllers: [
    TenantAuthController,
    TenantActivityLogController,
    TenantRoleController,
    TenantDesignationController,
    TenantNotificationController,
    DistributorController,
    AreaController,
    FlavourController,
    ProductBrandController,
    ProductCategoryController,
    ProductController,
    PjpController,
    RegionController,
    RouteController,
    UomController,
    TenantJobController,
    TenantUtilityController,
    TenantUserController,
    OpeningStockController,
    ProductPricingJobController,
    PurchaseStockController,
    MasterTenantDataController,
    StockTransferController,
    RetailerCategoryController,
    RetailerChannelController,
    RetailerController,
    AssetController,
    SchemeController,
    StockController,
    SaleOrderController,
    SaleVoucherController,
  ],
  providers: [
    TenantAuthService,
    ActivityLogService,
    TenantRoleService,
    TenantDesignationService,
    NotificationService,
    DistributorService,
    AreaService,
    FlavourService,
    ProductBrandService,
    ProductCategoryService,
    ProductService,
    PjpService,
    RegionService,
    RouteService,
    UomService,
    TenantUtilityService,
    MasterGeoHelperService,
    UserService,
    TenantPermissionGuard,
    PusherService,
    TenantJobService,
    OpeningStockService,
    PurchaseStockService,
    StockService,
    ProductPricingJobService,
    MasterTenantDataService,
    StockTransferService,
    RetailerCategoryService,
    RetailerChannelService,
    RetailerService,
    AssetService,
    SchemeService,
    StockImportService,
    RetailerSchemeEngineService,
    ProductSchemeEngineService,
    SaleOrderService,
    SaleVoucherService,
    RetailerLedgerService,
  ],
})
export class TenantModule { }