import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { TenantDbConnectionConfig } from '../types/db-connection.types';

const SENSITIVE_COLUMNS = new Set([
  'password',
  'token',
  'api_key',
  'secret',
  'refresh_token',
  'access_token',
]);

@Injectable()
export class SchemaReaderService {
  async readSchema(config: TenantDbConnectionConfig): Promise<{
    schemaText: string;
    allTables: string[];
  }> {
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
      const schema = config.schema || 'public';
      const tablesResult = await pool.query<{ table_name: string }>(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        `,
        [schema],
      );

      const allTables = tablesResult.rows.map((row) => row.table_name);
      if (!allTables.length) {
        return { schemaText: 'No tables found.', allTables: [] };
      }

      const columnsResult = await pool.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1
        ORDER BY table_name, ordinal_position
        `,
        [schema],
      );

      const lines: string[] = [];
      for (const table of allTables) {
        lines.push(`Table: ${table}`);
        const columns = columnsResult.rows.filter(
          (col) => col.table_name === table,
        );
        for (const col of columns) {
          if (SENSITIVE_COLUMNS.has(col.column_name.toLowerCase())) {
            continue;
          }
          lines.push(
            `  - ${col.column_name}: ${col.data_type} (nullable=${col.is_nullable === 'YES'})`,
          );
        }
        lines.push('');
      }

      return { schemaText: lines.join('\n').trim(), allTables };
    } finally {
      await pool.end();
    }
  }
}
