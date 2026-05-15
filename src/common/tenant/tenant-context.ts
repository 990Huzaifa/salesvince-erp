import { IndustryType, TenantStatus } from "src/master-db/entities/tenant.entity";

// src/common/tenant/tenant-context.ts
export type TenantContext = {
    isPlatform: boolean;
    tenantId?: string;
    name?: string; // subdomain
    code?: string; // internal code
    email?: string;
    industryType?: IndustryType;
    status?: TenantStatus;
};
