/** Private Pusher channel for a tenant user (optionally scoped to a business). */
export function buildTenantUserPusherChannel(
  tenantCode: string,
  userCode: string,
  businessCode?: string | null,
): string {
  const base = `private-tenant-${tenantCode}-user-${userCode}`;
  return businessCode ? `${base}-business-${businessCode}` : base;
}
