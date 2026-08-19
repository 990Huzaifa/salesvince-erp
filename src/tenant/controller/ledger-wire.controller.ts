import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { TenantJwtAuthGuard } from 'src/auth/tenant-jwt-auth.guard';
import { TenantBusinessAccessGuard } from 'src/auth/tenant-business-access.guard';
import { TenantPermissionGuard } from 'src/auth/tenant-permission.guard';
import { RequirePermissions } from 'src/auth/require-permission.decorator';
import { TenantConnectionGuard } from 'src/common/guards/tenant-connection.guard';
import { TenantJwtGuard } from 'src/common/guards/tenant-jwt.guard';
import { TenantConnection } from 'src/common/tenant/tenant-connection.decorator';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { LedgerWireService } from '../service/ledger-wire.service';

@Controller('tenant/ledger-wire')
@UseGuards(
  TenantJwtAuthGuard,
  TenantJwtGuard,
  TenantConnectionGuard,
  TenantBusinessAccessGuard,
  TenantPermissionGuard,
)
export class LedgerWireController {
  constructor(private readonly ledgerWireService: LedgerWireService) {}

  @Get('sale-orders/:code')
  @RequirePermissions('VIEW_SALE_ORDER')
  getSaleOrderByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getSaleOrderByCode(
      tenantDb,
      user.businessId,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('purchase-orders/:code')
  @RequirePermissions('VIEW_PURCHASE_ORDER')
  getPurchaseOrderByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getPurchaseOrderByCode(
      tenantDb,
      user.businessId,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('sale-vouchers/:code')
  @RequirePermissions('VIEW_SALE_VOUCHER')
  getSaleVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getSaleVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('purchase-vouchers/:code')
  @RequirePermissions('VIEW_PURCHASE_VOUCHER')
  getPurchaseVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getPurchaseVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('sale-return-vouchers/:code')
  @RequirePermissions('VIEW_SALE_RETURN_VOUCHER')
  getSaleReturnVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getSaleReturnVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('purchase-return-vouchers/:code')
  @RequirePermissions('VIEW_PURCHASE_RETURN_VOUCHER')
  getPurchaseReturnVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getPurchaseReturnVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('expense-vouchers/:code')
  @RequirePermissions('VIEW_EXPENSE_VOUCHER')
  getExpenseVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getExpenseVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('contra-vouchers/:code')
  @RequirePermissions('VIEW_CONTRA_VOUCHER')
  getContraVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getContraVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('loan-receipt-vouchers/:code')
  @RequirePermissions('VIEW_LOAN_RECEIPT_VOUCHER')
  getLoanReceiptVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getLoanReceiptVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('loan-payment-vouchers/:code')
  @RequirePermissions('VIEW_LOAN_PAYMENT_VOUCHER')
  getLoanPaymentVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getLoanPaymentVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }

  @Get('salary-vouchers/:code')
  @RequirePermissions('VIEW_SALARY_VOUCHER')
  getSalaryVoucherByCode(
    @TenantConnection() tenantDb: DataSource,
    @Param('code') code: string,
    @Req() req: Request,
  ) {
    const user = req.user as TenantRequestUser;
    return this.ledgerWireService.getSalaryVoucherByCode(
      tenantDb,
      user.businessId!,
      decodeURIComponent(code),
      user.userId,
    );
  }
}
