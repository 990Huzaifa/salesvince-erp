import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { TenantDbConnectionConfig } from '../types/db-connection.types';

const MAX_ROWS = 50;

@Injectable()
export class QueryExecutorService {
  async execute(
    config: TenantDbConnectionConfig,
    sql: string,
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
    });

    try {
      const result = await pool.query(sql);
      const rows = (result.rows ?? []).slice(0, MAX_ROWS) as Record<
        string,
        unknown
      >[];
      return { rows, rowCount: rows.length };
    } finally {
      await pool.end();
    }
  }
}
