import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VoucherOperationsService } from './voucher-operations.service';
import { EXPENSE_VOUCHER_CONFIG } from './voucher-configs';
import { VoucherListOptions } from './voucher.types';
import {
  CreateExpenseVoucherItemDto,
  UpdateExpenseVoucherDto,
} from '../../dto/voucher/expense-voucher.dto';

@Injectable()
export class ExpenseVoucherService {
  constructor(private readonly voucherOps: VoucherOperationsService) {}

  create(
    tenantDb: DataSource,
    businessId: string,
    items: CreateExpenseVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.create(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      items,
      userId,
    );
  }

  createAndApprove(
    tenantDb: DataSource,
    businessId: string,
    items: CreateExpenseVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.createAndApprove(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      items,
      userId,
    );
  }

  list(
    tenantDb: DataSource,
    businessId: string,
    options: VoucherListOptions,
    userId: string,
  ) {
    return this.voucherOps.list(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      options,
      userId,
    );
  }

  getById(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.getById(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  edit(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    dto: UpdateExpenseVoucherDto,
    userId: string,
  ) {
    return this.voucherOps.edit(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      id,
      dto,
      userId,
    );
  }

  approve(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.approve(
      tenantDb,
      businessId,
      EXPENSE_VOUCHER_CONFIG,
      id,
      userId,
    );
  }
}
