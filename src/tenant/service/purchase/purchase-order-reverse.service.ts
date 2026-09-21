import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import {
  OrderStatus,
  PurchaseOrder,
} from 'src/tenant-db/entities/purchase-order.entity';
import { Grn, GrnStatus } from 'src/tenant-db/entities/grn.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import { PurchaseReturn } from 'src/tenant-db/entities/purchase-return.entity';
import { PurchaseReturnVoucher } from 'src/tenant-db/entities/purchase-return-voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { GrnService } from './grn.service';
import { PurchaseReturnService } from './purchase-return.service';
import { PurchaseReturnVoucherService } from '../vouchers/purchase-return-voucher.service';
import { PurchaseInvoiceService } from './purchase-invoice.service';

@Injectable()
export class PurchaseOrderReverseService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly grnService: GrnService,
    private readonly purchaseReturnService: PurchaseReturnService,
    private readonly purchaseReturnVoucherService: PurchaseReturnVoucherService,
    private readonly purchaseInvoiceService: PurchaseInvoiceService,
  ) {}

  async reverse(
    tenantDb: DataSource,
    businessId: string | undefined,
    orderId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const order = await this.findOrderForBusiness(
      tenantDb,
      scopedBusinessId,
      orderId,
    );

    if (order.orderStatus === OrderStatus.CANCELLED) {
      throw new BadRequestException('Purchase order is already cancelled');
    }

    if (order.orderStatus !== OrderStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved purchase orders can be reversed',
      );
    }

    const reversed: {
      grnIds: string[];
      invoiceIds: string[];
      purchaseReturnIds: string[];
      purchaseReturnVoucherIds: string[];
    } = {
      grnIds: [],
      invoiceIds: [],
      purchaseReturnIds: [],
      purchaseReturnVoucherIds: [],
    };

    const cancelled = await tenantDb.transaction(async (manager) => {
      const grns = await manager.getRepository(Grn).find({
        where: { purchaseOrderId: order.id },
        relations: { items: true, vendor: true },
      });
      const invoices = await manager.getRepository(PurchaseInvoice).find({
        where: { purchaseOrderId: order.id, deletedAt: IsNull() },
      });
      const invoiceIds = invoices.map((invoice) => invoice.id);
      const purchaseReturns = invoiceIds.length
        ? await manager.getRepository(PurchaseReturn).find({
            where: { purchaseInvoiceId: In(invoiceIds) },
            relations: { purchaseReturnItems: true },
          })
        : [];
      const returnVouchers = invoiceIds.length
        ? await manager.getRepository(PurchaseReturnVoucher).find({
            where: { invoiceId: In(invoiceIds) },
          })
        : [];

      reversed.grnIds = grns.map((row) => row.id);
      reversed.invoiceIds = invoiceIds;
      reversed.purchaseReturnIds = purchaseReturns.map((row) => row.id);
      reversed.purchaseReturnVoucherIds = returnVouchers.map((row) => row.id);

      for (const voucher of returnVouchers) {
        await this.purchaseReturnVoucherService.deleteInManager(
          manager,
          scopedBusinessId,
          voucher.id,
        );
      }

      for (const purchaseReturn of purchaseReturns) {
        await this.purchaseReturnService.reverseApprovedEffects(
          manager,
          scopedBusinessId,
          purchaseReturn,
        );
      }

      for (const grn of grns) {
        if (grn.status === GrnStatus.APPROVED) {
          await this.grnService.reverseApproved(
            manager,
            scopedBusinessId,
            grn,
          );
          continue;
        }

        if (grn.status === GrnStatus.PENDING) {
          grn.status = GrnStatus.REJECTED;
          await manager.getRepository(Grn).save(grn);
        }
      }

      reversed.invoiceIds =
        await this.purchaseInvoiceService.softDeleteByPurchaseOrder(
          manager,
          order.id,
        );

      order.orderStatus = OrderStatus.CANCELLED;
      return manager.getRepository(PurchaseOrder).save(order);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_ORDER_REVERSED',
      description: `Purchase order ${cancelled.orderNumber} reversed`,
      metadata: {
        purchaseOrderId: cancelled.id,
        ...reversed,
      },
    });

    return {
      message: 'Purchase order reversed',
      data: {
        id: cancelled.id,
        orderNumber: cancelled.orderNumber,
        orderStatus: cancelled.orderStatus,
      },
    };
  }

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async findOrderForBusiness(
    tenantDb: DataSource,
    businessId: string,
    orderId: string,
  ): Promise<PurchaseOrder> {
    const order = await tenantDb
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.items', 'items')
      .where('po.id = :orderId', { orderId })
      .andWhere('po.businessId = :businessId', { businessId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    return order;
  }
}
