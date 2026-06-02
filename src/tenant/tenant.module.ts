import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantUserController } from './controller/tenant-user.controller';
import { TenantUserSetupController } from './controller/tenant-user-setup.controller';
import { TenantBusinessController } from './controller/tenant-business.controller';
import { TenantRoleController } from './controller/tenant-role.controller';
import { ChartOfAccountController } from './controller/chart-of-account.controller';
import { PartyController } from './controller/party.controller';
import { PurchaseVoucherController } from './controller/vouchers/purchase-voucher.controller';
import { SaleVoucherController } from './controller/vouchers/sale-voucher.controller';
import { PurchaseReturnVoucherController } from './controller/vouchers/purchase-return-voucher.controller';
import { SaleReturnVoucherController } from './controller/vouchers/sale-return-voucher.controller';
import { ExpenseVoucherController } from './controller/vouchers/expense-voucher.controller';
import { ContraVoucherController } from './controller/vouchers/contra-voucher.controller';
import { UserService } from './service/user.service';
import { TenantBusinessService } from './service/tenant-business.service';
import { TenantRoleService } from './service/tenant-role.service';
import { ChartOfAccountService } from './service/chart-of-account.service';
import { PartyService } from './service/party.service';
import { TransactionService } from './service/transaction.service';
import { VoucherOperationsService } from './service/vouchers/voucher-operations.service';
import { PurchaseVoucherService } from './service/vouchers/purchase-voucher.service';
import { SaleVoucherService } from './service/vouchers/sale-voucher.service';
import { PurchaseReturnVoucherService } from './service/vouchers/purchase-return-voucher.service';
import { SaleReturnVoucherService } from './service/vouchers/sale-return-voucher.service';
import { ExpenseVoucherService } from './service/vouchers/expense-voucher.service';
import { ContraVoucherService } from './service/vouchers/contra-voucher.service';
import { ActivityLogService } from './service/activity-log.service';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { MailModule } from 'src/common/mail/mail.module';
import { CommonModule } from 'src/common/common.module';
import { PusherService } from 'src/common/pusher/pusher.service';
import { TenantAuthService } from 'src/tenant/service/tenant-auth.service';
import { UomController } from './controller/uom.controller';
import { UomService } from './service/uom.service';
import { TenantJobService } from './service/tenant-job.service';
import { NotificationService } from './service/notification.service';
import { TenantJobController } from './controller/tenant-job.controller';
import { ProductBrandController } from './controller/product-brand.controller';
import { ProductBrandService } from './service/product-brand.service';
import { ProductSubCategoryController } from './controller/product-sub-category.controller';
import { ProductSubCategoryService } from './service/product-sub-category.service';
import { ProductCategoryController } from './controller/product-category.controller';
import { ProductCategoryService } from './service/product-category.service';
import { TransactionController } from './controller/transaction.controller';
import { AssetController } from './controller/asset.controller';
import { AssetService } from './service/asset.service';
import { ProductController } from './controller/product.controller';
import { ProductService } from './service/product.service';
import { TenantUtilityController } from './controller/utility.controller';
import { TenantUtilityService } from './service/tenant-utility.service';
import { PurchaseQuotationController } from './controller/Purchase/purchase-quotation.controller';
import { PurchaseQuotationService } from './service/purchase/purchase-quotation.service';
import { SaleQuotationController } from './controller/sale/sale-quotation.controller';
import { SaleQuotationService } from './service/sale/sale-quotation.service';
import { WarehouseController } from './controller/warehouse.controller';
import { WarehouseService } from './service/warehouse.service';
import { PurchaseOrderController } from './controller/Purchase/purchase-order.controller';
import { PurchaseOrderService } from './service/purchase/purchase-order.service';
import { GrnController } from './controller/Purchase/grn.controller';
import { GrnService } from './service/purchase/grn.service';
import { StockService } from './service/stock.service';
import { PurchaseInvoiceController } from './controller/Purchase/purchase-invoice.controller';
import { PurchaseInvoiceService } from './service/purchase/purchase-invoice.service';
import { PurchaseReturnController } from './controller/Purchase/purchase-return.controller';
import { PurchaseReturnService } from './service/purchase/purchase-return.service';
import { FinanceController } from './controller/finance.controller';
import { FinanceService } from './service/finance.service';
import { TenantNotificationController } from './controller/tenant-notification.controller';
import { MasterGeoHelperService } from './service/master-geo-helper.service';
import { SaleOrderController } from './controller/sale/sale-order.controller';
import { SaleOrderService } from './service/sale/sale-order.service';
import { DeliveryNoteController } from './controller/sale/delivery-note.controller';
import { DeliveryNoteService } from './service/sale/delivery-note.service';
import { SaleInvoiceController } from './controller/sale/sale-invoice.controller';
import { SaleInvoiceService } from './service/sale/sale-invoice.service';
import { SaleReturnController } from './controller/sale/sale-return.controller';
import { SaleReturnService } from './service/sale/sale-return.service';
import { ReportController } from './controller/report.controller';
import { ReportService } from './service/report.service';
import { DashboardController } from './controller/dashboard.controller';
import { DashboardService } from './service/dashboard.service';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { City } from 'src/master-db/entities/city.entity';
import { SqlAgentModule } from 'src/sql-agent/sql-agent.module';
import { SqlAgentController } from './controller/sql-agent.controller';
import { SqlAgentChatService } from './service/sql-agent-chat.service';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    MailModule,
    CommonModule,
    TenantRuntimeModule,
    SqlAgentModule,
    TypeOrmModule.forFeature([Tenant, Country, State, City]),
  ],
  controllers: [
    AssetController,
    TenantAuthController,
    TenantUserController,
    TenantUserSetupController,
    TenantBusinessController,
    TenantNotificationController,
    TenantRoleController,
    ChartOfAccountController,
    PartyController,
    PurchaseVoucherController,
    SaleVoucherController,
    PurchaseReturnVoucherController,
    SaleReturnVoucherController,
    ExpenseVoucherController,
    ContraVoucherController,
    UomController,
    ProductBrandController,
    ProductCategoryController,
    ProductSubCategoryController,
    ProductController,
    TenantJobController,
    TransactionController,
    TenantUtilityController,
    PurchaseQuotationController,
    SaleQuotationController,
    SaleOrderController,
    DeliveryNoteController,
    SaleInvoiceController,
    SaleReturnController,
    WarehouseController,
    PurchaseOrderController,
    GrnController,
    PurchaseInvoiceController,
    PurchaseReturnController,
    FinanceController,
    ReportController,
    DashboardController,
    SqlAgentController,
  ],
  providers: [
    TenantAuthService,
    NotificationService,
    UserService,
    TenantJobService,
    TenantBusinessService,
    TenantRoleService,
    ChartOfAccountService,
    PartyService,
    TransactionService,
    VoucherOperationsService,
    PurchaseVoucherService,
    SaleVoucherService,
    PurchaseReturnVoucherService,
    SaleReturnVoucherService,
    ExpenseVoucherService,
    ContraVoucherService,
    ActivityLogService,
    TenantPermissionGuard,
    PusherService,
    UomService,
    ProductBrandService,
    ProductCategoryService,
    ProductSubCategoryService,
    ProductService,
    AssetService,
    TenantUtilityService,
    PurchaseQuotationService,
    SaleQuotationService,
    SaleOrderService,
    DeliveryNoteService,
    SaleInvoiceService,
    SaleReturnService,
    WarehouseService,
    PurchaseOrderService,
    GrnService,
    StockService,
    PurchaseInvoiceService,
    PurchaseReturnService,
    FinanceService,
    MasterGeoHelperService,
    ReportService,
    DashboardService,
    SqlAgentChatService,
  ],
})
export class TenantModule {}
