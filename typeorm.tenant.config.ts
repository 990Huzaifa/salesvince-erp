import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();
export default new DataSource({
    type: 'postgres',
    host: process.env.TENANT_DB_HOST, // will override dynamically later
    port: Number(process.env.TENANT_DB_PORT),
    username: process.env.TENANT_DB_USER,
    password: process.env.TENANT_DB_PASS,
    database: process.env.TENANT_DB_NAME,
    entities: ['src/tenant-db/entities/**/*.ts'],
    migrations: ['src/tenant-db/migrations/*.ts'],
});
