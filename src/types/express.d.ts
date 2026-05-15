// src/types/express.d.ts
import { TenantContext } from '../common/tenant/tenant-context';
import { DataSource } from 'typeorm';

declare global {
    namespace Express {
        interface Request {
            tenant?: TenantContext;
            tenantDb?: DataSource;
            user?: {
                id?: string;
                sub?: string;
                email?: string;
                role?: string;
                type?: string;
                tenantId?: string;
                userId?: string;
                tenantCode?: string;
                tenantStatus?: string;
                [key: string]: unknown;
            };
        }
    }
}

export { };
