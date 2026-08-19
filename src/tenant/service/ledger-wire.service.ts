import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SaleOrderService } from './sale/sale-order.service';
import { PurchaseOrderService } from './purchase/purchase-order.service';
import { VoucherOperationsService } from './vouchers/voucher-operations.service';
import { SalaryVoucherService } from './vouchers/salary-voucher.service';
import {
  CONTRA_VOUCHER_CONFIG,
  EXPENSE_VOUCHER_CONFIG,
  LOAN_PAYMENT_VOUCHER_CONFIG,
  LOAN_RECEIPT_VOUCHER_CONFIG,
  PURCHASE_RETURN_VOUCHER_CONFIG,
  PURCHASE_VOUCHER_CONFIG,
  SALE_RETURN_VOUCHER_CONFIG,
  SALE_VOUCHER_CONFIG,
} from './vouchers/voucher-configs';

@Injectable()
export class LedgerWireService {
  constructor(
    private readonly saleOrderService: SaleOrderService,
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly voucherOps: VoucherOperationsService,
    private readonly salaryVoucherService: SalaryVoucherService,
  ) {}

  getSaleOrderByCode(
    tenantDb: DataSource,
    businessId: string | undefined,
    code: string,
    userId: string,
  ) {
    return this.saleOrderService.viewByCode(tenantDb, businessId, code, userId);
  }

  getPurchaseOrderByCode(
    tenantDb: DataSource,
    businessId: string | undefined,
    code: string,
    userId: string,
  ) {
    return this.purchaseOrderService.viewByCode(
      tenantDb,
      businessId,
      code,
      userId,
    );
  }

  getSaleVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      SALE_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getPurchaseVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      PURCHASE_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getSaleReturnVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      SALE_RETURN_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getPurchaseReturnVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      PURCHASE_RETURN_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getExpenseVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getContraVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      CONTRA_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getLoanReceiptVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      LOAN_RECEIPT_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getLoanPaymentVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.voucherOps.getByNumber(
      tenantDb,
      businessId,
      LOAN_PAYMENT_VOUCHER_CONFIG,
      code,
      userId,
    );
  }

  getSalaryVoucherByCode(
    tenantDb: DataSource,
    businessId: string,
    code: string,
    userId: string,
  ) {
    return this.salaryVoucherService.getByCode(
      tenantDb,
      businessId,
      code,
      userId,
    );
  }
}
