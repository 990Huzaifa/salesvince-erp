import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VoucherOperationsService } from './voucher-operations.service';
import { PURCHASE_RETURN_VOUCHER_CONFIG } from './voucher-configs';
import { VoucherListOptions } from './voucher.types';
import {
  CreatePurchaseReturnVoucherItemDto,
  UpdatePurchaseReturnVoucherDto,
} from '../../dto/voucher/purchase-return-voucher.dto';

@Injectable()
export class PurchaseReturnVoucherService {
  constructor(private readonly voucherOps: VoucherOperationsService) {}

  create(
    tenantDb: DataSource,
    businessId: string,
    items: CreatePurchaseReturnVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.create(
      tenantDb,
      businessId,
      PURCHASE_RETURN_VOUCHER_CONFIG,
      items,
      userId,
    );
  }

  createAndApprove(
    tenantDb: DataSource,
    businessId: string,
    items: CreatePurchaseReturnVoucherItemDto[],
    userId: string,
  ) {
    return this.voucherOps.createAndApprove(
      tenantDb,
      businessId,
      PURCHASE_RETURN_VOUCHER_CONFIG,
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
      PURCHASE_RETURN_VOUCHER_CONFIG,
      options,
      userId,
    );
  }

  getById(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.getById(
      tenantDb,
      businessId,
      PURCHASE_RETURN_VOUCHER_CONFIG,
      id,
      userId,
    );
  }

  edit(
    tenantDb: DataSource,
    businessId: string,
    id: string,
    dto: UpdatePurchaseReturnVoucherDto,
    userId: string,
  ) {
    return this.voucherOps.edit(
      tenantDb,
      businessId,
      PURCHASE_RETURN_VOUCHER_CONFIG,
      id,
      dto,
      userId,
    );
  }

  approve(tenantDb: DataSource, businessId: string, id: string, userId: string) {
    return this.voucherOps.approve(
      tenantDb,
      businessId,
      PURCHASE_RETURN_VOUCHER_CONFIG,
      id,
      userId,
    );
  }
}
