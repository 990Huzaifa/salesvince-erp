export const TENANT_MODULE_KEYS = {
  SQL_AGENT: 'SQL_AGENT',
} as const;

export type TenantModuleKey =
  (typeof TENANT_MODULE_KEYS)[keyof typeof TENANT_MODULE_KEYS];
