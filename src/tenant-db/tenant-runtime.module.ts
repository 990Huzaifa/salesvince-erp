import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantConnectionManager } from './services/tenant-connection-manager.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantDbConfig])],
  providers: [TenantConnectionManager],
  exports: [TenantConnectionManager],
})
export class TenantRuntimeModule {}
