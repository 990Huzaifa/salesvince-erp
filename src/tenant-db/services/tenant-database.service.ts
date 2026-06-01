import { Injectable } from '@nestjs/common';
import { TenantDataSource } from '../tenant-datasource.factory';
import { runTenantSeeders as executeTenantSeeders } from '../seeders/run-tenant-seeders';

@Injectable()
export class TenantDatabaseService {
    async runMigrations(
        host: string,
        port: number,
        username: string,
        password: string,
        database: string,
    ): Promise<string[]> {
        const dataSource = TenantDataSource(
            host,
            port,
            username,
            password,
            database,
        );

        await dataSource.initialize();
        const executed = await dataSource.runMigrations();
        await dataSource.destroy();

        return executed.map((migration) => migration.name);
    }

    async runTenantSeeders(
        host: string,
        port: number,
        username: string,
        password: string,
        database: string,
    ) {
        const dataSource = TenantDataSource(
            host,
            port,
            username,
            password,
            database,
        );

        await dataSource.initialize();
        await executeTenantSeeders(dataSource);
        await dataSource.destroy();
    }
}
