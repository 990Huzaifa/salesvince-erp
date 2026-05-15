import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
    type: 'postgres',
    host: process.env.MASTER_DB_HOST,
    port: Number(process.env.MASTER_DB_PORT),
    username: process.env.MASTER_DB_USER,
    password: process.env.MASTER_DB_PASS,
    database: process.env.MASTER_DB_NAME,
    entities: ['src/master-db/entities/**/*.ts'],
    migrations: ['src/master-db/migrations/*.ts'],
});
