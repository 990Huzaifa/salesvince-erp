/**
 * Frontend public routes embedded in PDF QR codes.
 * Host: https://{tenantName}.{FRONTEND_DOMAIN|DOMAIN}
 */
export type PublicDocumentViewKind =
  | 'sale-order'
  | 'sale-invoice'
  | 'purchase-order'
  | 'purchase-invoice'
  | 'warehouse-slip/sale-invoice'
  | 'warehouse-slip/purchase-invoice'
  | 'warehouse-slip/stock-transfer'
  | 'warehouse-slip/opening-stock'
  | 'warehouse-slip/stock-adjustment';

const PUBLIC_PATHS: Record<PublicDocumentViewKind, string> = {
  'sale-order': '/public/sale-order',
  'sale-invoice': '/public/sale-invoice',
  'purchase-order': '/public/purchase-order',
  'purchase-invoice': '/public/purchase-invoice',
  'warehouse-slip/sale-invoice': '/public/warehouse-slip/sale-invoice',
  'warehouse-slip/purchase-invoice': '/public/warehouse-slip/purchase-invoice',
  'warehouse-slip/stock-transfer': '/public/warehouse-slip/stock-transfer',
  'warehouse-slip/opening-stock': '/public/warehouse-slip/opening-stock',
  'warehouse-slip/stock-adjustment': '/public/warehouse-slip/stock-adjustment',
};

/** Frontend host domain (without protocol / tenant). Prefer FRONTEND_DOMAIN over API DOMAIN. */
export function resolveFrontendDomain(): string | null {
  const value = (
    process.env.FRONTEND_DOMAIN ||
    process.env.DOMAIN ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  return value || null;
}

/**
 * Build absolute public view URL for QR codes.
 * Example: https://acme.app.example.com/public/sale-invoice/{id}
 */
export function buildPublicDocumentViewUrl(
  kind: PublicDocumentViewKind,
  documentId: string,
  tenantName?: string | null,
): string | null {
  const id = documentId?.trim();
  const name = tenantName?.trim().toLowerCase();
  const domain = resolveFrontendDomain();
  if (!id || !name || !domain) {
    return null;
  }

  const path = PUBLIC_PATHS[kind];
  if (!path) {
    return null;
  }

  return `https://${name}.${domain}${path}/${encodeURIComponent(id)}`;
}
