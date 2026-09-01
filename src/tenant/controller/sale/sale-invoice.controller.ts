import {
  Controller,
  BadRequestException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { parseBooleanQuery } from 'src/common/pdf';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { SaleInvoiceService } from '../../service/sale/sale-invoice.service';
import { sendPdf } from 'src/common/pdf';

@Controller('tenant/sale-invoices')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class SaleInvoiceController {
  constructor(private readonly saleInvoiceService: SaleInvoiceService) {}

  @Get()
  @RequirePermissions('LIST_SALE_INVOICE')
  list(
    @TenantConnection() tenantDb: DataSource,
    @Req() req: Request,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('deliveryNoteId') deliveryNoteId?: string,
    @Query('saleOrderId') saleOrderId?: string,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleInvoiceService.list(
      tenantDb,
      user.businessId,
      {
        page: Number(page),
        limit: Number(limit),
        search,
        deliveryNoteId,
        saleOrderId,
      },
      user.userId,
    );
  }

  @Get(':id/pdf')
  @RequirePermissions('VIEW_SALE_INVOICE')
  async downloadPdf(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('showBalanceDetails') showBalanceDetailsQuery?: string,
  ) {
    const showBalanceDetails = parseBooleanQuery(showBalanceDetailsQuery);
    if (showBalanceDetails === null) {
      throw new BadRequestException('showBalanceDetails must be true or false');
    }
    const user = req.user as TenantRequestUser;
    const { buffer, filename } = await this.saleInvoiceService.generatePdf(
      tenantDb,
      user.businessId,
      id,
      user.userId,
      showBalanceDetails,
    );
    sendPdf(res, { buffer, filename });
  }

  @Get(':id')
  @RequirePermissions('VIEW_SALE_INVOICE')
  view(
    @TenantConnection() tenantDb: DataSource,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.saleInvoiceService.view(
      tenantDb,
      user.businessId,
      id,
      user.userId,
    );
  }
}
