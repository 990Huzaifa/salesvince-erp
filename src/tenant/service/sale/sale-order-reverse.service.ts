import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import {
  OrderStatus,
  SaleOrder,
  SaleOrderItem,
} from 'src/tenant-db/entities/sale-order.entity';
import {
  DeliveryNote,
  DeliveryNoteStatus,
} from 'src/tenant-db/entities/delivery-note.entity';
import { SaleInvoice } from 'src/tenant-db/entities/sale-invoice.entity';
import { SaleReturn } from 'src/tenant-db/entities/sale-return.entity';
import { SaleReturnVoucher } from 'src/tenant-db/entities/sale-return-voucher.entity';
import { ActivityLogService } from '../activity-log.service';
import { StockService } from '../stock.service';
import { DeliveryNoteService } from './delivery-note.service';
import { SaleReturnService } from './sale-return.service';
import { SaleReturnVoucherService } from '../vouchers/sale-return-voucher.service';
import { SaleInvoiceService } from './sale-invoice.service';

type UndeliveredStockLine = {
  warehouseId: string;
  productId: string;
  uomId: string;
  quantity: number;
};

@Injectable()
export class SaleOrderReverseService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly deliveryNoteService: DeliveryNoteService,
    private readonly saleReturnService: SaleReturnService,
    private readonly saleReturnVoucherService: SaleReturnVoucherService,
    private readonly saleInvoiceService: SaleInvoiceService,
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
      throw new BadRequestException('Sale order is already cancelled');
    }

    if (order.orderStatus !== OrderStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved sale orders can be reversed',
      );
    }

    const reversed: {
      deliveryNoteIds: string[];
      invoiceIds: string[];
      saleReturnIds: string[];
      saleReturnVoucherIds: string[];
    } = {
      deliveryNoteIds: [],
      invoiceIds: [],
      saleReturnIds: [],
      saleReturnVoucherIds: [],
    };

    const cancelled = await tenantDb.transaction(async (manager) => {
      const deliveryNotes = await manager.getRepository(DeliveryNote).find({
        where: { saleOrderId: order.id },
        relations: { items: { saleOrderItem: true }, customer: true },
      });
      const invoices = await manager.getRepository(SaleInvoice).find({
        where: { saleOrderId: order.id, deletedAt: IsNull() },
      });
      const invoiceIds = invoices.map((invoice) => invoice.id);
      const saleReturns = invoiceIds.length
        ? await manager.getRepository(SaleReturn).find({
            where: { saleInvoiceId: In(invoiceIds) },
            relations: { saleReturnItems: true },
          })
        : [];
      const returnVouchers = invoiceIds.length
        ? await manager.getRepository(SaleReturnVoucher).find({
            where: { invoiceId: In(invoiceIds) },
          })
        : [];

      reversed.deliveryNoteIds = deliveryNotes.map((row) => row.id);
      reversed.invoiceIds = invoiceIds;
      reversed.saleReturnIds = saleReturns.map((row) => row.id);
      reversed.saleReturnVoucherIds = returnVouchers.map((row) => row.id);

      const undeliveredLines = this.computeUndeliveredLines(order, deliveryNotes);

      for (const voucher of returnVouchers) {
        await this.saleReturnVoucherService.deleteInManager(
          manager,
          scopedBusinessId,
          voucher.id,
        );
      }

      for (const saleReturn of saleReturns) {
        await this.saleReturnService.reverseApprovedEffects(
          manager,
          scopedBusinessId,
          saleReturn,
        );
      }

      for (const deliveryNote of deliveryNotes) {
        if (deliveryNote.status === DeliveryNoteStatus.APPROVED) {
          await this.deliveryNoteService.reverseApproved(
            manager,
            scopedBusinessId,
            deliveryNote,
          );
          continue;
        }

        if (deliveryNote.status === DeliveryNoteStatus.PENDING) {
          deliveryNote.status = DeliveryNoteStatus.REJECTED;
          await manager.getRepository(DeliveryNote).save(deliveryNote);
        }
      }

      reversed.invoiceIds = await this.saleInvoiceService.softDeleteBySaleOrder(
        manager,
        order.id,
      );

      if (undeliveredLines.length) {
        await this.stockService.releaseReservedStock(manager, {
          businessId: scopedBusinessId,
          lines: undeliveredLines,
        });
      }

      order.orderStatus = OrderStatus.CANCELLED;
      const saved = await manager.getRepository(SaleOrder).save(order);
      return saved;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'SALE_ORDER_REVERSED',
      description: `Sale order ${cancelled.orderNumber} reversed`,
      metadata: {
        saleOrderId: cancelled.id,
        ...reversed,
      },
    });

    return {
      message: 'Sale order reversed',
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
  ): Promise<SaleOrder> {
    const order = await tenantDb
      .getRepository(SaleOrder)
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.items', 'items')
      .where('so.id = :orderId', { orderId })
      .andWhere('so.businessId = :businessId', { businessId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Sale order not found');
    }

    return order;
  }

  private computeUndeliveredLines(
    order: SaleOrder,
    deliveryNotes: DeliveryNote[],
  ): UndeliveredStockLine[] {
    const deliveredByItem = new Map<string, number>();

    for (const deliveryNote of deliveryNotes) {
      if (deliveryNote.status !== DeliveryNoteStatus.APPROVED) {
        continue;
      }

      for (const item of deliveryNote.items ?? []) {
        deliveredByItem.set(
          item.saleOrderItemId,
          (deliveredByItem.get(item.saleOrderItemId) ?? 0) +
            Number(item.deliveredQuantity),
        );
      }
    }

    return (order.items ?? [])
      .map((item: SaleOrderItem) => ({
        warehouseId: item.warehouseId,
        productId: item.productId,
        uomId: item.uomId,
        quantity:
          Number(item.quantity) - (deliveredByItem.get(item.id) ?? 0),
      }))
      .filter((line) => line.quantity > 0);
  }
}
