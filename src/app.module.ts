import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app/app-config.module';
import { MasterDbModule } from './master-db/master-db.module';
import { PlatformModule } from './platform/platform.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantModule } from './tenant/tenant.module';
import { TenantRuntimeModule } from './tenant-db/tenant-runtime.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    MasterDbModule,
    CommonModule,
    AuthModule,
    PlatformModule,
    TenantModule,
    TenantRuntimeModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
