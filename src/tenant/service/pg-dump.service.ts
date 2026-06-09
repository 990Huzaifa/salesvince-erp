import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { gzip } from 'zlib';
import { TenantDbConnectionConfig } from 'src/sql-agent/types/db-connection.types';

const gzipAsync = promisify(gzip);

@Injectable()
export class PgDumpService {
  private readonly logger = new Logger(PgDumpService.name);
  private readonly pgDumpBin = process.env.PG_DUMP_PATH || 'pg_dump';

  async dumpDatabaseGzipped(config: TenantDbConnectionConfig): Promise<Buffer> {
    const args = [
      '-h',
      config.host,
      '-p',
      String(config.port),
      '-U',
      config.user,
      '-d',
      config.database,
      '--no-owner',
      '--no-acl',
      '--format=plain',
    ];

    this.logger.debug(
      `Running pg_dump for ${config.database}@${config.host}:${config.port}`,
    );

    const sqlBuffer = await this.runPgDump(args, config.password);
    return gzipAsync(sqlBuffer);
  }

  private runPgDump(args: string[], password: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pgDumpBin, args, {
        env: { ...process.env, PGPASSWORD: password },
        windowsHide: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.on('error', (err) => {
        reject(new Error(`Failed to start pg_dump: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks));
          return;
        }
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
        reject(new Error(`pg_dump exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
      });
    });
  }
}
