export const TENANT_LOGIN_TOKEN = 'TENANT_LOGIN' as const;
export const BUSINESS_ACCESS_TOKEN = 'BUSINESS_ACCESS' as const;

export type TenantAccessTokenType =
  | typeof TENANT_LOGIN_TOKEN
  | typeof BUSINESS_ACCESS_TOKEN;
