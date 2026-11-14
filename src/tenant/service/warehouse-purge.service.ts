import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { SaleOrder, SaleOrderItem } from 'src/tenant-db/entities/sale-order.entity';
import {
  DeliveryNote,
  DeliveryNoteItem,
} from 'src/tenant-db/entities/delivery-note.entity';
import {
  SaleInvoice,
  SaleInvoiceItem,
} from 'src/tenant-db/entities/sale-invoice.entity';
import {
  SaleReturn,
  SaleReturnItem,
} from 'src/tenant-db/entities/sale-return.entity';
import { SaleReturnVoucher } from 'src/tenant-db/entities/sale-return-voucher.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
} from 'src/tenant-db/entities/purchase-order.entity';
import { Grn, GrnItem } from 'src/tenant-db/entities/grn.entity';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
} from 'src/tenant-db/entities/purchase-invoice.entity';
import {
  PurchaseReturn,
  PurchaseReturnItem,
} from 'src/tenant-db/entities/purchase-return.entity';
import { PurchaseReturnVoucher } from 'src/tenant-db/entities/purchase-return-voucher.entity';
import {
  StockTransfer,
  StockTransferItem,
} from 'src/tenant-db/entities/stock-transfer.entity';
import {
  OpeningStock,
  OpeningStockItem,
} from 'src/tenant-db/entities/opening-stock.entity';
import {
  Batch,
  StockBalance,
  StockMovement,
} from 'src/tenant-db/entities/stock.entity';
import {
  AccountTransactionReferenceType,
  Transaction,
} from 'src/tenant-db/entities/transaction.entity';
import { BusinessSettings } from 'src/tenant-db/entities/business-settings.entity';
import { ActivityLogService } from './activity-log.service';

type PurgeCounts = Record<string, number>;

@Injectable()
export class WarehousePurgeService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async idsFromQb(
    rows: Array<{ id: string } | Record<string, string>>,
    key = 'id',
  ): Promise<string[]> {
    return [...new Set(rows.map((r) => r[key]).filter(Boolean))];
  }

  private async deleteByIds(
    manager: EntityManager,
    entity: new () => object,
    ids: string[],
  ): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const result = await manager.getRepository(entity).delete({ id: In(chunk) });
      total += result.affected ?? 0;
    }
    return total;
  }

  private async deleteTransactions(
    manager: EntityManager,
    businessId: string,
    referenceType: AccountTransactionReferenceType,
    referenceIds: string[],
  ): Promise<number> {
    if (!referenceIds.length) return 0;
    let total = 0;
    const chunkSize = 500;
    for (let i = 0; i < referenceIds.length; i += chunkSize) {
      const chunk = referenceIds.slice(i, i + chunkSize);
      const result = await manager.getRepository(Transaction).delete({
        businessId,
        referenceType,
        referenceId: In(chunk),
      });
      total += result.affected ?? 0;
    }
    return total;
  }

  async purgeByCode(
    tenantDb: DataSource,
    businessId: string | undefined,
    warehouseCode: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const code = warehouseCode?.trim();
    if (!code) {
      throw new BadRequestException('warehouseCode is required');
    }

    const warehouse = await tenantDb.getRepository(Warehouse).findOne({
      where: {
        businessId: scopedBusinessId,
        code,
        deletedAt: IsNull(),
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with code "${code}" not found`);
    }

    const warehouseId = warehouse.id;
    const counts: PurgeCounts = {};

    await tenantDb.transaction(async (manager) => {
      // --- Collect sale document IDs (any line on this warehouse) ---
      const saleOrderIds = await this.idsFromQb(
        await manager
          .getRepository(SaleOrderItem)
          .createQueryBuilder('soi')
          .innerJoin('soi.saleOrder', 'so')
          .select('DISTINCT so.id', 'id')
          .where('so.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('soi.warehouseId = :warehouseId', { warehouseId })
          .getRawMany(),
      );

      const deliveryNoteIdsFromOrders = saleOrderIds.length
        ? await this.idsFromQb(
            await manager
              .getRepository(DeliveryNote)
              .createQueryBuilder('dn')
              .select('dn.id', 'id')
              .where('dn.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('dn.saleOrderId IN (:...saleOrderIds)', { saleOrderIds })
              .getRawMany(),
          )
        : [];

      const deliveryNoteIdsFromItems = await this.idsFromQb(
        await manager
          .getRepository(DeliveryNoteItem)
          .createQueryBuilder('dni')
          .innerJoin('dni.deliveryNote', 'dn')
          .select('DISTINCT dn.id', 'id')
          .where('dn.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('dni.warehouseId = :warehouseId', { warehouseId })
          .getRawMany(),
      );

      const deliveryNoteIds = [
        ...new Set([...deliveryNoteIdsFromOrders, ...deliveryNoteIdsFromItems]),
      ];

      const saleInvoiceIdsFromParents: string[] = [];
      if (saleOrderIds.length) {
        saleInvoiceIdsFromParents.push(
          ...(await this.idsFromQb(
            await manager
              .getRepository(SaleInvoice)
              .createQueryBuilder('si')
              .select('si.id', 'id')
              .where('si.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('si.saleOrderId IN (:...saleOrderIds)', { saleOrderIds })
              .withDeleted()
              .getRawMany(),
          )),
        );
      }
      if (deliveryNoteIds.length) {
        saleInvoiceIdsFromParents.push(
          ...(await this.idsFromQb(
            await manager
              .getRepository(SaleInvoice)
              .createQueryBuilder('si')
              .select('si.id', 'id')
              .where('si.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('si.deliveryNoteId IN (:...deliveryNoteIds)', {
                deliveryNoteIds,
              })
              .withDeleted()
              .getRawMany(),
          )),
        );
      }

      const saleInvoiceIdsFromItems = await this.idsFromQb(
        await manager
          .getRepository(SaleInvoiceItem)
          .createQueryBuilder('sii')
          .innerJoin('sii.saleInvoice', 'si')
          .select('DISTINCT si.id', 'id')
          .where('si.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('sii.warehouseId = :warehouseId', { warehouseId })
          .withDeleted()
          .getRawMany(),
      );

      const saleInvoiceIds = [
        ...new Set([...saleInvoiceIdsFromParents, ...saleInvoiceIdsFromItems]),
      ];

      const saleReturnIds = saleInvoiceIds.length
        ? await this.idsFromQb(
            await manager
              .getRepository(SaleReturn)
              .createQueryBuilder('sr')
              .select('sr.id', 'id')
              .where('sr.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('sr.saleInvoiceId IN (:...saleInvoiceIds)', {
                saleInvoiceIds,
              })
              .getRawMany(),
          )
        : [];

      const saleReturnIdsFromItems = await this.idsFromQb(
        await manager
          .getRepository(SaleReturnItem)
          .createQueryBuilder('sri')
          .innerJoin('sri.saleReturn', 'sr')
          .select('DISTINCT sr.id', 'id')
          .where('sr.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('sri.warehouseId = :warehouseId', { warehouseId })
          .getRawMany(),
      );

      const allSaleReturnIds = [
        ...new Set([...saleReturnIds, ...saleReturnIdsFromItems]),
      ];

      const saleReturnVoucherIds = saleInvoiceIds.length
        ? await this.idsFromQb(
            await manager
              .getRepository(SaleReturnVoucher)
              .createQueryBuilder('srv')
              .select('srv.id', 'id')
              .where('srv.invoiceId IN (:...saleInvoiceIds)', { saleInvoiceIds })
              .getRawMany(),
          )
        : [];

      // --- Collect purchase document IDs ---
      const purchaseOrderIds = await this.idsFromQb(
        await manager
          .getRepository(PurchaseOrder)
          .createQueryBuilder('po')
          .select('po.id', 'id')
          .where('po.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('po.warehouseId = :warehouseId', { warehouseId })
          .getRawMany(),
      );

      const grnIds = await this.idsFromQb(
        await manager
          .getRepository(Grn)
          .createQueryBuilder('grn')
          .select('grn.id', 'id')
          .where('grn.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('grn.warehouseId = :warehouseId', { warehouseId })
          .withDeleted()
          .getRawMany(),
      );

      const purchaseInvoiceIds: string[] = [];
      if (purchaseOrderIds.length) {
        purchaseInvoiceIds.push(
          ...(await this.idsFromQb(
            await manager
              .getRepository(PurchaseInvoice)
              .createQueryBuilder('pi')
              .select('pi.id', 'id')
              .where('pi.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('pi.purchaseOrderId IN (:...purchaseOrderIds)', {
                purchaseOrderIds,
              })
              .withDeleted()
              .getRawMany(),
          )),
        );
      }
      if (grnIds.length) {
        purchaseInvoiceIds.push(
          ...(await this.idsFromQb(
            await manager
              .getRepository(PurchaseInvoice)
              .createQueryBuilder('pi')
              .select('pi.id', 'id')
              .where('pi.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('pi.grnId IN (:...grnIds)', { grnIds })
              .withDeleted()
              .getRawMany(),
          )),
        );
      }
      const uniquePurchaseInvoiceIds = [...new Set(purchaseInvoiceIds)];

      const purchaseReturnIds = uniquePurchaseInvoiceIds.length
        ? await this.idsFromQb(
            await manager
              .getRepository(PurchaseReturn)
              .createQueryBuilder('pr')
              .select('pr.id', 'id')
              .where('pr.businessId = :businessId', {
                businessId: scopedBusinessId,
              })
              .andWhere('pr.purchaseInvoiceId IN (:...purchaseInvoiceIds)', {
                purchaseInvoiceIds: uniquePurchaseInvoiceIds,
              })
              .getRawMany(),
          )
        : [];

      const purchaseReturnVoucherIds = uniquePurchaseInvoiceIds.length
        ? await this.idsFromQb(
            await manager
              .getRepository(PurchaseReturnVoucher)
              .createQueryBuilder('prv')
              .select('prv.id', 'id')
              .where('prv.invoiceId IN (:...purchaseInvoiceIds)', {
                purchaseInvoiceIds: uniquePurchaseInvoiceIds,
              })
              .getRawMany(),
          )
        : [];

      const stockTransferIds = await this.idsFromQb(
        await manager
          .getRepository(StockTransfer)
          .createQueryBuilder('st')
          .select('st.id', 'id')
          .where('st.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere(
            '(st.fromWarehouseId = :warehouseId OR st.toWarehouseId = :warehouseId)',
            { warehouseId },
          )
          .withDeleted()
          .getRawMany(),
      );

      const openingStockIds = await this.idsFromQb(
        await manager
          .getRepository(OpeningStock)
          .createQueryBuilder('os')
          .select('os.id', 'id')
          .where('os.businessId = :businessId', {
            businessId: scopedBusinessId,
          })
          .andWhere('os.warehouseId = :warehouseId', { warehouseId })
          .withDeleted()
          .getRawMany(),
      );

      // --- Ledger transactions for document refs ---
      counts.transactions =
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.SALE_RETURN_VOUCHER,
          saleReturnVoucherIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.SALE_RETURN,
          allSaleReturnIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.SALE_INVOICE,
          saleInvoiceIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.DELIVERY_NOTE,
          deliveryNoteIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.SALE_ORDER,
          saleOrderIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.PURCHASE_RETURN_VOUCHER,
          purchaseReturnVoucherIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.PURCHASE_RETURN,
          purchaseReturnIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.PURCHASE_INVOICE,
          uniquePurchaseInvoiceIds,
        )) +
        (await this.deleteTransactions(
          manager,
          scopedBusinessId,
          AccountTransactionReferenceType.GRN,
          grnIds,
        ));

      // --- Sale chain (children → parents) ---
      if (saleReturnVoucherIds.length) {
        counts.saleReturnVouchers = await this.deleteByIds(
          manager,
          SaleReturnVoucher,
          saleReturnVoucherIds,
        );
      }

      if (allSaleReturnIds.length) {
        const saleReturnItemIds = await this.idsFromQb(
          await manager
            .getRepository(SaleReturnItem)
            .createQueryBuilder('sri')
            .select('sri.id', 'id')
            .where('sri.saleReturnId IN (:...ids)', { ids: allSaleReturnIds })
            .getRawMany(),
        );
        counts.saleReturnItems = await this.deleteByIds(
          manager,
          SaleReturnItem,
          saleReturnItemIds,
        );
        counts.saleReturns = await this.deleteByIds(
          manager,
          SaleReturn,
          allSaleReturnIds,
        );
      }

      if (saleInvoiceIds.length) {
        const saleInvoiceItemIds = await this.idsFromQb(
          await manager
            .getRepository(SaleInvoiceItem)
            .createQueryBuilder('sii')
            .select('sii.id', 'id')
            .where('sii.saleInvoiceId IN (:...ids)', { ids: saleInvoiceIds })
            .withDeleted()
            .getRawMany(),
        );
        counts.saleInvoiceItems = await this.deleteByIds(
          manager,
          SaleInvoiceItem,
          saleInvoiceItemIds,
        );
        counts.saleInvoices = await this.deleteByIds(
          manager,
          SaleInvoice,
          saleInvoiceIds,
        );
      }

      if (deliveryNoteIds.length) {
        const deliveryNoteItemIds = await this.idsFromQb(
          await manager
            .getRepository(DeliveryNoteItem)
            .createQueryBuilder('dni')
            .select('dni.id', 'id')
            .where('dni.deliveryNoteId IN (:...ids)', { ids: deliveryNoteIds })
            .getRawMany(),
        );
        counts.deliveryNoteItems = await this.deleteByIds(
          manager,
          DeliveryNoteItem,
          deliveryNoteItemIds,
        );
        counts.deliveryNotes = await this.deleteByIds(
          manager,
          DeliveryNote,
          deliveryNoteIds,
        );
      }

      if (saleOrderIds.length) {
        const saleOrderItemIds = await this.idsFromQb(
          await manager
            .getRepository(SaleOrderItem)
            .createQueryBuilder('soi')
            .select('soi.id', 'id')
            .where('soi.saleOrderId IN (:...ids)', { ids: saleOrderIds })
            .getRawMany(),
        );
        counts.saleOrderItems = await this.deleteByIds(
          manager,
          SaleOrderItem,
          saleOrderItemIds,
        );
        counts.saleOrders = await this.deleteByIds(
          manager,
          SaleOrder,
          saleOrderIds,
        );
      }

      // --- Purchase chain ---
      if (purchaseReturnVoucherIds.length) {
        counts.purchaseReturnVouchers = await this.deleteByIds(
          manager,
          PurchaseReturnVoucher,
          purchaseReturnVoucherIds,
        );
      }

      if (purchaseReturnIds.length) {
        const purchaseReturnItemIds = await this.idsFromQb(
          await manager
            .getRepository(PurchaseReturnItem)
            .createQueryBuilder('pri')
            .select('pri.id', 'id')
            .where('pri.purchaseReturnId IN (:...ids)', {
              ids: purchaseReturnIds,
            })
            .getRawMany(),
        );
        counts.purchaseReturnItems = await this.deleteByIds(
          manager,
          PurchaseReturnItem,
          purchaseReturnItemIds,
        );
        counts.purchaseReturns = await this.deleteByIds(
          manager,
          PurchaseReturn,
          purchaseReturnIds,
        );
      }

      if (uniquePurchaseInvoiceIds.length) {
        const purchaseInvoiceItemIds = await this.idsFromQb(
          await manager
            .getRepository(PurchaseInvoiceItem)
            .createQueryBuilder('pii')
            .select('pii.id', 'id')
            .where('pii.purchaseInvoiceId IN (:...ids)', {
              ids: uniquePurchaseInvoiceIds,
            })
            .withDeleted()
            .getRawMany(),
        );
        counts.purchaseInvoiceItems = await this.deleteByIds(
          manager,
          PurchaseInvoiceItem,
          purchaseInvoiceItemIds,
        );
        counts.purchaseInvoices = await this.deleteByIds(
          manager,
          PurchaseInvoice,
          uniquePurchaseInvoiceIds,
        );
      }

      if (grnIds.length) {
        const grnItemIds = await this.idsFromQb(
          await manager
            .getRepository(GrnItem)
            .createQueryBuilder('gi')
            .select('gi.id', 'id')
            .where('gi.grnId IN (:...ids)', { ids: grnIds })
            .withDeleted()
            .getRawMany(),
        );
        counts.grnItems = await this.deleteByIds(manager, GrnItem, grnItemIds);
        counts.grns = await this.deleteByIds(manager, Grn, grnIds);
      }

      if (purchaseOrderIds.length) {
        const purchaseOrderItemIds = await this.idsFromQb(
          await manager
            .getRepository(PurchaseOrderItem)
            .createQueryBuilder('poi')
            .select('poi.id', 'id')
            .where('poi.purchaseOrderId IN (:...ids)', {
              ids: purchaseOrderIds,
            })
            .getRawMany(),
        );
        counts.purchaseOrderItems = await this.deleteByIds(
          manager,
          PurchaseOrderItem,
          purchaseOrderItemIds,
        );
        counts.purchaseOrders = await this.deleteByIds(
          manager,
          PurchaseOrder,
          purchaseOrderIds,
        );
      }

      // --- Stock transfers ---
      if (stockTransferIds.length) {
        const stockTransferItemIds = await this.idsFromQb(
          await manager
            .getRepository(StockTransferItem)
            .createQueryBuilder('sti')
            .select('sti.id', 'id')
            .where('sti.stockTransferId IN (:...ids)', {
              ids: stockTransferIds,
            })
            .getRawMany(),
        );
        counts.stockTransferItems = await this.deleteByIds(
          manager,
          StockTransferItem,
          stockTransferItemIds,
        );
        counts.stockTransfers = await this.deleteByIds(
          manager,
          StockTransfer,
          stockTransferIds,
        );
      }

      // --- Opening stock ---
      if (openingStockIds.length) {
        const openingStockItemIds = await this.idsFromQb(
          await manager
            .getRepository(OpeningStockItem)
            .createQueryBuilder('osi')
            .select('osi.id', 'id')
            .where('osi.openingStockId IN (:...ids)', { ids: openingStockIds })
            .getRawMany(),
        );
        counts.openingStockItems = await this.deleteByIds(
          manager,
          OpeningStockItem,
          openingStockItemIds,
        );
        counts.openingStocks = await this.deleteByIds(
          manager,
          OpeningStock,
          openingStockIds,
        );
      }

      // --- Stock ledger for this warehouse ---
      const movementResult = await manager.getRepository(StockMovement).delete({
        businessId: scopedBusinessId,
        warehouseId,
      });
      counts.stockMovements = movementResult.affected ?? 0;

      const balanceResult = await manager.getRepository(StockBalance).delete({
        businessId: scopedBusinessId,
        warehouseId,
      });
      counts.stockBalances = balanceResult.affected ?? 0;

      const batchResult = await manager.getRepository(Batch).delete({
        businessId: scopedBusinessId,
        warehouseId,
      });
      counts.batches = batchResult.affected ?? 0;

      // Clear default warehouse pointer if it points here
      await manager
        .getRepository(BusinessSettings)
        .createQueryBuilder()
        .update(BusinessSettings)
        .set({ defaultWarehouseId: null })
        .where('businessId = :businessId', { businessId: scopedBusinessId })
        .andWhere('defaultWarehouseId = :warehouseId', { warehouseId })
        .execute();

      // Soft-delete warehouse (keeps UUID for any remaining RESTRICT refs e.g. claims)
      await manager.getRepository(Warehouse).softDelete({ id: warehouseId });
      counts.warehouseSoftDeleted = 1;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'WAREHOUSE_PURGED',
      description: `Warehouse ${warehouse.name} (${warehouse.code}) purged`,
      metadata: {
        warehouseId,
        warehouseCode: warehouse.code,
        counts,
      },
    });

    return {
      data: {
        warehouseId,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        softDeleted: true,
        counts,
      },
    };
  }
}
