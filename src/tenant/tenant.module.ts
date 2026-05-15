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
import { UserService } from './service/user.service';
import { TenantBusinessService } from './service/tenant-business.service';
import { TenantRoleService } from './service/tenant-role.service';
import { ActivityLogService } from './service/activity-log.service';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { MailModule } from 'src/common/mail/mail.module';
import { CommonModule } from 'src/common/common.module';
import { PusherService } from 'src/common/pusher/pusher.service';
import { TenantAuthService } from 'src/tenant/service/tenant-auth.service';
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
  ],
  providers: [
    TenantAuthService,
    UserService,
    TenantBusinessService,
    TenantRoleService,
    ActivityLogService,
    TenantPermissionGuard,
    PusherService,
  ],
})
export class TenantModule {}
