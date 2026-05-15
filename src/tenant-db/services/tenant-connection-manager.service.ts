import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { TenantDbConfig } from '../../master-db/entities/tenant-db-config.entity';
import { createTenantDataSource } from '../tenant-datasource.factory';

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private readonly pools = new Map<string, Promise<DataSource>>();

  constructor(
    @InjectRepository(TenantDbConfig)
    private readonly tenantDbConfigRepo: Repository<TenantDbConfig>,
  ) {}

  async getConnection(tenantId: string): Promise<DataSource> {
    const existingPool = this.pools.get(tenantId);
    if (existingPool) {
      this.logger.debug(`Tenant DB pool cache hit for tenant ${tenantId}`);
      return existingPool;
    }

    this.logger.log(`Tenant DB pool cache miss for tenant ${tenantId}`);
    const connectionPromise = this.initializeConnection(tenantId);
    this.pools.set(tenantId, connectionPromise);

    try {
      return await connectionPromise;
    } catch (error) {
      // Remove broken promise so future requests can retry.
      this.pools.delete(tenantId);
      throw error;
    }
  }

  async closeConnection(tenantId: string): Promise<void> {
    const poolPromise = this.pools.get(tenantId);
    if (!poolPromise) {
      return;
    }

    this.pools.delete(tenantId);
    const pool = await poolPromise;
    if (pool.isInitialized) {
      await pool.destroy();
      this.logger.log(`Closed tenant DB pool for tenant ${tenantId}`);
    }
  }

  async closeAll(): Promise<void> {
    const entries = [...this.pools.entries()];
    this.pools.clear();

    await Promise.all(
      entries.map(async ([tenantId, poolPromise]) => {
        try {
          const pool = await poolPromise;
          if (pool.isInitialized) {
            await pool.destroy();
          }
          this.logger.log(`Closed tenant DB pool for tenant ${tenantId}`);
        } catch (error) {
          this.logger.error(
            `Failed to close tenant DB pool for tenant ${tenantId}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeAll();
  }

  private async initializeConnection(tenantId: string): Promise<DataSource> {
    const dbConfig = await this.tenantDbConfigRepo.findOne({
      where: { tenant: { id: tenantId } },
    });

    if (!dbConfig) {
      this.logger.warn(`No tenant DB config found for tenant ${tenantId}`);
      throw new UnauthorizedException('Tenant DB config not found');
    }

    const dataSource = createTenantDataSource(
      dbConfig.host,
      Number(dbConfig.port),
      dbConfig.username,
      dbConfig.password,
      dbConfig.database,
      `tenant-${tenantId}`,
    );

    await dataSource.initialize();
    this.logger.log(`Initialized tenant DB pool for tenant ${tenantId}`);
    return dataSource;
  }
}
