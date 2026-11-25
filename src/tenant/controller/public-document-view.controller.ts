import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PublicDocumentViewService } from '../service/public-document-view.service';

const getRequestHeader = (req: Request, names: string[]): string | undefined => {
  for (const name of names) {
    const value = req.headers[name];
    if (!value) {
      continue;
    }
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) {
      return headerValue.split(',')[0].trim();
    }
  }
  return undefined;
};

/** Resolve tenant host from Origin / Referer / Host (same as tenant auth). */
const resolveTenantHost = (
  origin?: string,
  referer?: string,
  host?: string,
): string | undefined => {
  const source = origin || referer;
  if (!source) {
    return host;
  }

  try {
    return new URL(source).host;
  } catch {
    return host;
  }
};

/**
 * Unauthenticated document views for QR / share links.
 * Tenant is resolved from the request subdomain; document by UUID.
 */
@Controller('public')
export class PublicDocumentViewController {
  constructor(
    private readonly publicDocumentViewService: PublicDocumentViewService,
  ) {}

  @Get('sale-orders/:id')
  getSaleOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.publicDocumentViewService.getSaleOrder(
      this.tenantHostFrom(req),
      id,
    );
  }

  @Get('sale-invoices/:id')
  getSaleInvoice(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.publicDocumentViewService.getSaleInvoice(
      this.tenantHostFrom(req),
      id,
    );
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.publicDocumentViewService.getPurchaseOrder(
      this.tenantHostFrom(req),
      id,
    );
  }

  @Get('purchase-invoices/:id')
  getPurchaseInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.publicDocumentViewService.getPurchaseInvoice(
      this.tenantHostFrom(req),
      id,
    );
  }

  private tenantHostFrom(req: Request): string | undefined {
    const origin = getRequestHeader(req, ['origin', 'x-forwarded-origin']);
    const referer = getRequestHeader(req, ['referer']);
    const host = getRequestHeader(req, [
      'x-original-host',
      'x-forwarded-host',
      'host',
    ]);
    return resolveTenantHost(origin, referer, host);
  }
}
