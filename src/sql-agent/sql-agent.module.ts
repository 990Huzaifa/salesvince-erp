import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDbConnectionAdapter } from './adapters/tenant-db-connection.adapter';
import { AiModelService } from './services/ai-model.service';
import { QueryExecutorService } from './services/query-executor.service';
import { SchemaReaderService } from './services/schema-reader.service';
import { SqlValidatorService } from './services/sql-validator.service';
import { SqlAgentService } from './sql-agent.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantDbConfig])],
  providers: [
    AiModelService,
    SchemaReaderService,
    SqlValidatorService,
    QueryExecutorService,
    TenantDbConnectionAdapter,
    SqlAgentService,
  ],
  exports: [SqlAgentService, TenantDbConnectionAdapter],
})
export class SqlAgentModule {}
