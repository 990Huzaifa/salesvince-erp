import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getProvisioningDatabaseConfig } from 'src/config/database/database-env';

@Injectable()
export class ProvisioningAdminService {
    private adminDataSource: DataSource;

    async createAdminConnection() {
        const config = getProvisioningDatabaseConfig();
        this.adminDataSource = new DataSource({
            type: 'postgres',
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            database: config.database,
            synchronize: false,
        });

        await this.adminDataSource.initialize();
    }

    async closeConnection() {
        if (this.adminDataSource?.isInitialized) {
            await this.adminDataSource.destroy();
        }
    }

    // start from here

    async createDatabaseIfNotExists(dbName: string) {
        if (!this.adminDataSource?.isInitialized) {
            throw new Error('Admin connection not initialized');
        }

        const result = await this.adminDataSource.query(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            [dbName],
        );

        if (result.length === 0) {
            await this.adminDataSource.query(
                `CREATE DATABASE "${dbName}";`
            );
            return { created: true };
        }

        return { created: false };
    }


    async createUserIfNotExists(username: string, password: string) {
        const result = await this.adminDataSource.query(
            `SELECT 1 FROM pg_roles WHERE rolname = '${username}'`,
        );

        if (result.length === 0) {
            await this.adminDataSource.query(
                `CREATE USER "${username}" WITH PASSWORD '${password}';`
            );
            return { created: true };
        }

        return { created: false };
    }


    async grantPrivileges(dbName: string, username: string) {
        await this.adminDataSource.query(
            `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${username}";`
        );
    }

    async grantSchemaPrivileges(dbName: string, username: string) {
        const config = getProvisioningDatabaseConfig();
        const tenantDs = new DataSource({
            type: 'postgres',
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            database: dbName,
        });

        await tenantDs.initialize();

        await tenantDs.query(
            `GRANT ALL ON SCHEMA public TO "${username}";`
        );

        await tenantDs.query(
            `ALTER DATABASE "${dbName}" OWNER TO "${username}";`
        );

        await tenantDs.destroy();
    }

    getDataSource() {
        return this.adminDataSource;
    }
}
