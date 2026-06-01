import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantDbConfig } from 'src/master-db/entities/tenant-db-config.entity';
import { TenantDbConnectionConfig } from '../types/db-connection.types';

@Injectable()
export class TenantDbConnectionAdapter {
  constructor(
    @InjectRepository(TenantDbConfig)
    private readonly tenantDbConfigRepo: Repository<TenantDbConfig>,
  ) {}

  async getConnectionConfig(tenantId: string): Promise<TenantDbConnectionConfig> {
    const dbConfig = await this.tenantDbConfigRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!dbConfig) {
      throw new UnauthorizedException('Tenant DB config not found');
    }

    return {
      dbType: 'postgres',
      host: dbConfig.host,
      port: Number(dbConfig.port),
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      schema: 'public',
    };
  }
}
