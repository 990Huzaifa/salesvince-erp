import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { Tenant } from '../master-db/entities/tenant.entity';
import { TenantProvisioningJob } from 'src/master-db/entities/tenant-provisioning-job.entity';
import { TenantProvisioningLog } from 'src/master-db/entities/tenant-provisioning-log.entity';
import { TenantSettings } from 'src/master-db/entities/tenant-settings.entity';
import { TenantProfile } from 'src/master-db/entities/tenant-profile.entity';
import { TenantTheme } from 'src/master-db/entities/tenant-themes.entity';
import { ProvisioningAdminService } from './services/provisioning-admin.service';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDatabaseService } from 'src/tenant-db/services/tenant-database.service';
import { PlatformRole } from 'src/master-db/entities/platform-role.entity';
import { PlatformUser } from 'src/master-db/entities/platform-user.entity';
import { TenantGeoPolicy } from 'src/master-db/entities/tenant-geo-policy.entity';
import { Customer } from 'src/master-db/entities/customer.entity';
import { CustomerService } from './services/customer.service';
import { CustomerController } from './controller/customer.controller';
import { MailService } from 'src/common/mail/mail.service';
import { HttpModule } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { UtilityController } from './controller/utility.controller';
import { UtilityService } from './services/utility.service';
import { Country } from 'src/master-db/entities/country.entity';
import { State } from 'src/master-db/entities/state.entity';
import { City } from 'src/master-db/entities/city.entity';
import { PlanController } from './controller/plan.controller';
import { AnnouncementController } from './controller/announcement.controller';
import { PlanService } from './services/plan.service';
import { Announcement, AnnouncementPlan, AnnouncementTenant } from 'src/master-db/entities/announcement.entity';
import { AnnouncementService } from './services/announcements.service';
import { Plan, PlanLimit } from 'src/master-db/entities/plan.entity';
import { PlatformUserService } from './services/platform-user.service';
import { PlatformUserController } from './controller/platform-user.controller';
import { PlatformPermission } from 'src/master-db/entities/platform-premission.entity';
import { Subscription, SubscriptionAddon } from 'src/master-db/entities/subscription.entity';
import { SubscriptionController } from './controller/subscription.controller';
import { SubscriptionService } from './services/subscription.service';
import { AddonController } from './controller/addon.controller';
import { AddonService } from './services/addon.service';
import { Addon } from 'src/master-db/entities/addon.entity';
import { Module as ModuleEntity } from 'src/master-db/entities/module.entity';
import { ModuleController } from './controller/module.controller';
import { ModuleService } from './services/module.service';
import { Notification } from 'src/master-db/entities/notification.entity';
import { NotificationService } from './services/notification.service';
import { NotificationController } from './controller/notification.controller';
import { PusherService } from 'src/common/pusher/pusher.service';
import { ActivityLog } from 'src/master-db/entities/activity-log.entity';
import { ActivityLogService } from './services/activity-log.service';
import { ActivityLogController } from './controller/activity-log.controller';
import { TenantModule } from 'src/master-db/entities/tenant-modules.entity';
import { Invoice, InvoiceItem, InvoicePayment } from 'src/master-db/entities/invoice.entity';
import { InvoiceController } from './controller/invoice.controller';
import { InvoiceService } from './services/invoice.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      Tenant,
      TenantProvisioningJob,
      TenantProvisioningLog,
      TenantSettings,
      TenantProfile,
      TenantGeoPolicy,
      TenantModule,
      TenantTheme,
      TenantDbConfig,
      PlatformPermission,
      PlatformRole,
      PlatformUser,
      Announcement,
      AnnouncementPlan,
      AnnouncementTenant,
      Customer,
      Plan,
      Addon,
      ModuleEntity,
      PlanLimit,
      Subscription,
      SubscriptionAddon,
      Notification,
      ActivityLog,
      Invoice,
      InvoiceItem,
      InvoicePayment,
      Announcement,
      Country,
      State,
      City
    ]),
  ],
  controllers: [PlatformController, PlatformUserController, CustomerController, PlanController, AddonController, ModuleController, SubscriptionController, AnnouncementController, UtilityController, NotificationController, ActivityLogController, InvoiceController],
  providers: [PlatformService, ProvisioningAdminService, TenantDatabaseService, CustomerService, PlatformUserService, PlanService, AddonService, SubscriptionService, AnnouncementService, UtilityService, MailService, JwtService, ModuleService, NotificationService, PusherService, ActivityLogService, InvoiceService],
})
export class PlatformModule {}
