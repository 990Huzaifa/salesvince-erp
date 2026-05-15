// src/types/express.d.ts
import { TenantContext } from '../common/tenant/tenant-context';
import { DataSource } from 'typeorm';
import type { TenantRequestUser } from '../auth/tenant-jwt.strategy';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      tenantDb?: DataSource;
      user?: TenantRequestUser & Record<string, unknown>;
    }
  }
}

export {};
