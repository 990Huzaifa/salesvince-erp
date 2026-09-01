import { DataSource } from 'typeorm';
import * as path from 'path';

export function createTenantDataSource(
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
    name?: string,
) {
    return new DataSource({
        name,
        type: 'postgres',
        host,
        port,
        username,
        password,
        database,
        // The API runs from TypeScript in development and compiled JavaScript
        // in production. Loading only *.js leaves dynamic tenant data sources
        // without metadata during `nest start`.
        entities: [path.join(__dirname, 'entities/**/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, 'migrations/**/*{.ts,.js}')],
    });
}

export function TenantDataSource(
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
) {
    return new DataSource({
        type: 'postgres',
        host,
        port,
        username,
        password,
        database,
        entities: [path.join(__dirname, 'entities/**/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, 'migrations/**/*{.ts,.js}')],
    });
}
