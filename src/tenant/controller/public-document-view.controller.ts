import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getClientIp } from 'src/common/pdf';
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
 * Tenant from subdomain; HTML uses the business's connected document template pack.
 */
@Controller('public')
export class PublicDocumentViewController {
  constructor(
    private readonly publicDocumentViewService: PublicDocumentViewService,
  ) {}

  @Get('sale-orders/:id')
  getSaleOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.publicDocumentViewService.getSaleOrder(id, this.optionsFrom(req));
  }

  @Get('sale-orders/:id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getSaleOrderHtml(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.publicDocumentViewService.getSaleOrder(
      id,
      this.optionsFrom(req),
    );
    res.type('html').send(result.html);
  }

  @Get('sale-invoices/:id')
  getSaleInvoice(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.publicDocumentViewService.getSaleInvoice(
      id,
      this.optionsFrom(req),
    );
  }

  @Get('sale-invoices/:id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getSaleInvoiceHtml(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.publicDocumentViewService.getSaleInvoice(
      id,
      this.optionsFrom(req),
    );
    res.type('html').send(result.html);
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.publicDocumentViewService.getPurchaseOrder(
      id,
      this.optionsFrom(req),
    );
  }

  @Get('purchase-orders/:id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getPurchaseOrderHtml(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.publicDocumentViewService.getPurchaseOrder(
      id,
      this.optionsFrom(req),
    );
    res.type('html').send(result.html);
  }

  @Get('purchase-invoices/:id')
  getPurchaseInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.publicDocumentViewService.getPurchaseInvoice(
      id,
      this.optionsFrom(req),
    );
  }

  @Get('purchase-invoices/:id/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getPurchaseInvoiceHtml(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.publicDocumentViewService.getPurchaseInvoice(
      id,
      this.optionsFrom(req),
    );
    res.type('html').send(result.html);
  }

  private optionsFrom(req: Request) {
    return {
      tenantHost: this.tenantHostFrom(req),
      clientIp: getClientIp(req),
    };
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
