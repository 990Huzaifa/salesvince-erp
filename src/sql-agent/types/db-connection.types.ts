export type DbType = 'postgres';

export interface TenantDbConnectionConfig {
  dbType: DbType;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string;
}
