import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from 'src/master-db/entities/tenant.entity';
import { AuthModule } from 'src/auth/auth.module';
import { TenantRuntimeModule } from 'src/tenant-db/tenant-runtime.module';
import { TenantAuthController } from './controller/tenant-auth.controller';
import { TenantUserController } from './controller/tenant-user.controller';
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
@Module({
  imports: [
    HttpModule,
    AuthModule,
    MailModule,
    CommonModule,
    TenantRuntimeModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  controllers: [
    TenantAuthController,
    TenantUserController,
    TenantBusinessController,
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
    ProductSubCategoryController,
    TenantJobController,
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
    ProductSubCategoryService,
  ],
})
export class TenantModule {}
