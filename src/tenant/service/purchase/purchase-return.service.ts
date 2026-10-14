import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Brackets, DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  PurchaseReturn,
  PurchaseReturnItem,
  PurchaseReturnStatus,
} from 'src/tenant-db/entities/purchase-return.entity';
import {
  PurchaseInvoice,
  PurchaseInvoiceItem,
} from 'src/tenant-db/entities/purchase-invoice.entity';
import { Grn } from 'src/tenant-db/entities/grn.entity';
import { Party } from 'src/tenant-db/entities/party.entity';
import { ReferenceType } from 'src/tenant-db/entities/stock.entity';
import { AccountTransactionReferenceType } from 'src/tenant-db/entities/transaction.entity';
import { CreatePurchaseReturnDto } from '../../dto/purchase-return/create-purchase-return.dto';
import { CreatePurchaseReturnItemDto } from '../../dto/purchase-return/create-purchase-return-item.dto';
import { UpdatePurchaseReturnDto } from '../../dto/purchase-return/update-purchase-return.dto';
import { BulkApprovePurchaseReturnsDto } from '../../dto/purchase-return/bulk-approve-purchase-returns.dto';
import {
  PurchaseReturnJsonImportDto,
  PurchaseReturnJsonItemDto,
} from '../../dto/purchase-return/purchase-return-json-export-import.dto';
import {
  JsonExportEntity,
  JsonImportMode,
  SALESVINCE_EXPORT_FORMAT,
} from '../../dto/import-export/json-export-envelope.dto';
import { ActivityLogService } from '../activity-log.service';
import {
  ListAnalyticsModule,
  ListAnalyticsService,
} from '../list-analytics.service';
import { NotificationService } from '../notification.service';
import { TenantJob, TenantJobService } from '../tenant-job.service';
import { StockService } from '../stock.service';
import { TransactionService } from '../transaction.service';
import { resolveInventoryControlAccount } from 'src/tenant-db/helpers/sales-revenue-chart-of-account.helper';

const RETURN_NUMBER_PREFIX = 'PRT';

type ResolvedReturnLine = {
  productId: string;
  uomId: string;
  productFlavourId: string | null;
  quantity: number;
  lineAmount: number;
  purchaseUnitPrice: number;
  saleUnitPrice: number;
};

@Injectable()
export class PurchaseReturnService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
    private readonly listAnalyticsService: ListAnalyticsService,
    private readonly notificationService: NotificationService,
    private readonly tenantJobService: TenantJobService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private roundAmount(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private returnRelations() {
    return {
      purchaseInvoice: {
        items: true,
        grn: { warehouse: true, items: true },
        vendor: true,
        purchaseOrder: true,
      },
      purchaseReturnItems: {
        product: true,
        productFlavour: { flavour: true },
        uom: true,
      },
    } as const;
  }

  private async generateReturnNumber(
    repositorySource: DataSource | EntityManager,
  ): Promise<string> {
    const last = await repositorySource
      .getRepository(PurchaseReturn)
      .createQueryBuilder('purchaseReturn')
      .where('purchaseReturn.returnNumber LIKE :prefix', {
        prefix: `${RETURN_NUMBER_PREFIX}-%`,
      })
      .orderBy('purchaseReturn.returnNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.returnNumber.replace(`${RETURN_NUMBER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }

    return `${RETURN_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private lineAmountForQuantity(
    invoiceItem: PurchaseInvoiceItem,
    quantity: number,
  ): number {
    const invoicedQty = Number(invoiceItem.quantity);
    if (invoicedQty <= 0) {
      return 0;
    }
    return this.roundAmount(
      (Number(invoiceItem.totalAmount) / invoicedQty) * quantity,
    );
  }

  private async getReturnedQuantityByInvoiceItem(
    manager: EntityManager,
    purchaseInvoiceId: string,
    excludeReturnId?: string,
  ): Promise<Map<string, number>> {
    const returns = await manager.getRepository(PurchaseReturn).find({
      where: {
        purchaseInvoiceId,
        status: In([
          PurchaseReturnStatus.PENDING,
          PurchaseReturnStatus.APPROVED,
        ]),
      },
      relations: { purchaseReturnItems: true },
    });

    const invoice = await manager.getRepository(PurchaseInvoice).findOne({
      where: { id: purchaseInvoiceId },
      relations: { items: true },
    });
    if (!invoice?.items?.length) {
      return new Map();
    }

    const itemKey = (item: {
      productId: string;
      uomId: string;
      productFlavourId?: string | null;
    }) =>
      `${item.productId}:${item.uomId}:${item.productFlavourId ?? ''}`;

    const invoiceItemByKey = new Map(
      invoice.items.map((row) => [itemKey(row), row.id]),
    );

    const returned = new Map<string, number>();

    for (const purchaseReturn of returns) {
      if (excludeReturnId && purchaseReturn.id === excludeReturnId) {
        continue;
      }
      for (const line of purchaseReturn.purchaseReturnItems ?? []) {
        const invoiceItemId = invoiceItemByKey.get(itemKey(line));
        if (!invoiceItemId) {
          continue;
        }
        returned.set(
          invoiceItemId,
          (returned.get(invoiceItemId) ?? 0) + Number(line.quantity),
        );
      }
    }

    return returned;
  }

  private resolveCreateLines(
    invoice: PurchaseInvoice,
    dto: CreatePurchaseReturnDto,
    alreadyReturned: Map<string, number>,
  ): ResolvedReturnLine[] {
    const itemsById = new Map(
      (invoice.items ?? []).map((item) => [item.id, item]),
    );
    const grnItemByProductUom = new Map(
      (invoice.grn?.items ?? []).map((item) => [
        `${item.productId}:${item.uomId}:${item.productFlavourId ?? ''}`,
        item,
      ]),
    );

    const resolved: ResolvedReturnLine[] = [];

    for (const line of dto.items) {
      const invoiceItem = itemsById.get(line.purchaseInvoiceItemId);
      if (!invoiceItem) {
        throw new BadRequestException(
          `Purchase invoice item ${line.purchaseInvoiceItemId} not found on this invoice`,
        );
      }

      const priorReturned = alreadyReturned.get(invoiceItem.id) ?? 0;
      const maxReturnable = Number(invoiceItem.quantity) - priorReturned;
      if (line.quantity > maxReturnable) {
        throw new BadRequestException(
          `Return quantity exceeds remaining invoice quantity for product ${invoiceItem.productId}`,
        );
      }

      const grnItem = grnItemByProductUom.get(
        `${invoiceItem.productId}:${invoiceItem.uomId}:${invoiceItem.productFlavourId ?? ''}`,
      );

      resolved.push({
        productId: invoiceItem.productId,
        uomId: invoiceItem.uomId,
        productFlavourId: invoiceItem.productFlavourId ?? null,
        quantity: line.quantity,
        lineAmount: this.lineAmountForQuantity(invoiceItem, line.quantity),
        purchaseUnitPrice: Number(invoiceItem.purchaseUnitPrice),
        saleUnitPrice: Number(grnItem?.saleUnitPrice ?? 0),
      });
    }

    return resolved;
  }

  private async findPurchaseInvoiceForReturn(
    tenantDb: DataSource | EntityManager,
    businessId: string,
    purchaseInvoiceId: string,
  ): Promise<PurchaseInvoice> {
    const invoice = await tenantDb.getRepository(PurchaseInvoice).findOne({
      where: {
        id: purchaseInvoiceId,
        businessId,
        deletedAt: IsNull(),
      },
      relations: {
        items: true,
        vendor: true,
        grn: { items: true, warehouse: true },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    if (!invoice.grn) {
      throw new BadRequestException(
        'Purchase invoice must be linked to a GRN before creating a return',
      );
    }
    if (!invoice.items?.length) {
      throw new BadRequestException(
        'Purchase invoice must have items to create a return',
      );
    }

    return invoice;
  }

  private async findReturnForBusiness(
    tenantDb: DataSource,
    businessId: string,
    returnId: string,
  ): Promise<PurchaseReturn> {
    const purchaseReturn = await tenantDb
      .getRepository(PurchaseReturn)
      .createQueryBuilder('purchaseReturn')
      .leftJoinAndSelect('purchaseReturn.purchaseInvoice', 'purchaseInvoice')
      .leftJoinAndSelect('purchaseInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('purchaseInvoice.grn', 'grn')
      .leftJoinAndSelect('grn.items', 'grnItems')
      .leftJoinAndSelect('grn.warehouse', 'warehouse')
      .leftJoinAndSelect('purchaseInvoice.vendor', 'vendor')
      .leftJoinAndSelect('purchaseInvoice.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseReturn.purchaseReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .where('purchaseReturn.id = :returnId', { returnId })
      .andWhere('purchaseReturn.businessId = :businessId', { businessId })
      .getOne();

    if (!purchaseReturn) {
      throw new NotFoundException('Purchase return not found');
    }

    return purchaseReturn;
  }

  private mapPurchaseReturn(purchaseReturn: PurchaseReturn) {
    const invoice = purchaseReturn.purchaseInvoice;
    const items = (purchaseReturn.purchaseReturnItems ?? []).map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            skuCode: item.product.skuCode,
          }
        : null,
      productFlavourId: item.productFlavourId,
      productFlavour: item.productFlavour
        ? {
            id: item.productFlavour.id,
            flavourId: item.productFlavour.flavourId,
            flavour: item.productFlavour.flavour
              ? {
                  id: item.productFlavour.flavour.id,
                  name: item.productFlavour.flavour.name,
                }
              : null,
          }
        : null,
      uomId: item.uomId,
      uom: item.uom ? { id: item.uom.id, name: item.uom.name } : null,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const totalReturnAmount = items.reduce((sum, item) => {
      const invoiceItem = invoice?.items?.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
      );
      if (!invoiceItem) {
        return sum;
      }
      return sum + this.lineAmountForQuantity(invoiceItem, Number(item.quantity));
    }, 0);

    return {
      id: purchaseReturn.id,
      businessId: purchaseReturn.businessId,
      purchaseInvoiceId: purchaseReturn.purchaseInvoiceId,
      purchaseInvoice: invoice
        ? {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            totalAmount: invoice.totalAmount,
            vendorId: invoice.vendorId,
            vendor: invoice.vendor
              ? {
                  id: invoice.vendor.id,
                  code: invoice.vendor.code,
                  name: invoice.vendor.name,
                }
              : null,
            grn: invoice.grn
              ? {
                  id: invoice.grn.id,
                  grnNumber: invoice.grn.grnNumber,
                  warehouseId: invoice.grn.warehouseId,
                  warehouse: invoice.grn.warehouse
                    ? {
                        id: invoice.grn.warehouse.id,
                        code: invoice.grn.warehouse.code,
                        name: invoice.grn.warehouse.name,
                      }
                    : null,
                }
              : null,
          }
        : null,
      returnNumber: purchaseReturn.returnNumber,
      returnDate: purchaseReturn.returnDate,
      returnReason: purchaseReturn.returnReason,
      status: purchaseReturn.status,
      totalReturnAmount: this.roundAmount(totalReturnAmount),
      items,
      createdAt: purchaseReturn.createdAt,
      updatedAt: purchaseReturn.updatedAt,
    };
  }

  private assertPendingStatus(
    purchaseReturn: PurchaseReturn,
    message = 'Only pending purchase returns can perform this action',
  ): void {
    if (purchaseReturn.status !== PurchaseReturnStatus.PENDING) {
      throw new BadRequestException(message);
    }
  }

  private async executePurchaseReturnApproval(
    manager: EntityManager,
    businessId: string,
    purchaseReturn: PurchaseReturn,
    invoice: PurchaseInvoice,
    lines: ResolvedReturnLine[],
  ): Promise<PurchaseReturn> {
    this.assertPendingStatus(
      purchaseReturn,
      'Only pending purchase returns can be approved',
    );

    const grn = invoice.grn as Grn;
    const vendor = invoice.vendor as Party;

    if (!vendor?.payableAccountId) {
      throw new BadRequestException(
        'Vendor payable account is required before approving a purchase return',
      );
    }

    const totalAmount = this.roundAmount(
      lines.reduce((sum, line) => sum + line.lineAmount, 0),
    );
    if (totalAmount <= 0) {
      throw new BadRequestException(
        'Purchase return total amount must be greater than zero',
      );
    }

    await this.stockService.consumeStockOut(manager, {
      businessId,
      warehouseId: grn.warehouseId,
      referenceType: ReferenceType.PURCHASE_RETURN,
      lines: lines.map((line) => ({
        productId: line.productId,
        uomId: line.uomId,
        quantity: line.quantity,
      })),
    });

    const inventory = await resolveInventoryControlAccount(manager, businessId);
    const description = `Purchase return ${purchaseReturn.returnNumber} - vendor payable reduced`;

    // Dr Vendor Payable / Cr Inventory (reverse GRN).
    await this.transactionService.postJournal(manager, {
      businessId,
      referenceType: AccountTransactionReferenceType.PURCHASE_RETURN,
      referenceId: purchaseReturn.id,
      partyId: vendor.id,
      transactionDate: purchaseReturn.returnDate,
      description,
      lines: [
        {
          chartOfAccountId: vendor.payableAccountId,
          debitAmount: totalAmount,
          description,
        },
        {
          chartOfAccountId: inventory.id,
          creditAmount: totalAmount,
          description,
        },
      ],
    });

    purchaseReturn.status = PurchaseReturnStatus.APPROVED;
    await manager.getRepository(PurchaseReturn).save(purchaseReturn);

    return manager.getRepository(PurchaseReturn).findOneOrFail({
      where: { id: purchaseReturn.id },
      relations: this.returnRelations(),
    });
  }

  private async persistNewPurchaseReturn(
    manager: EntityManager,
    scopedBusinessId: string,
    invoice: PurchaseInvoice,
    dto: CreatePurchaseReturnDto,
  ): Promise<{
    purchaseReturn: PurchaseReturn;
    resolvedLines: ResolvedReturnLine[];
  }> {
    const returnRepo = manager.getRepository(PurchaseReturn);
    const returnNumber =
      dto.returnNumber?.trim() || (await this.generateReturnNumber(manager));

    if (dto.returnNumber?.trim()) {
      const taken = await returnRepo.findOne({
        where: { returnNumber },
      });
      if (taken) {
        throw new ConflictException(
          'Purchase return with this number already exists',
        );
      }
    }

    const alreadyReturned = await this.getReturnedQuantityByInvoiceItem(
      manager,
      invoice.id,
    );
    const resolvedLines = this.resolveCreateLines(
      invoice,
      dto,
      alreadyReturned,
    );

    const purchaseReturn = await returnRepo.save(
      returnRepo.create({
        businessId: scopedBusinessId,
        purchaseInvoiceId: invoice.id,
        returnNumber,
        returnDate: new Date(dto.returnDate),
        returnReason: dto.returnReason.trim(),
        status: PurchaseReturnStatus.PENDING,
      }),
    );

    await manager.getRepository(PurchaseReturnItem).save(
      resolvedLines.map((line) =>
        manager.getRepository(PurchaseReturnItem).create({
          purchaseReturnId: purchaseReturn.id,
          productId: line.productId,
          productFlavourId: line.productFlavourId,
          uomId: line.uomId,
          quantity: line.quantity,
        }),
      ),
    );

    return { purchaseReturn, resolvedLines };
  }

  private async reverseReturnSideEffects(
    manager: EntityManager,
    businessId: string,
    purchaseReturn: PurchaseReturn,
    invoice: PurchaseInvoice,
    lines: ResolvedReturnLine[],
  ): Promise<void> {
    const grn = invoice.grn as Grn;
    const vendor = invoice.vendor as Party;

    if (!vendor?.payableAccountId) {
      throw new BadRequestException(
        'Vendor payable account is required to reverse a purchase return',
      );
    }

    const totalAmount = this.roundAmount(
      lines.reduce((sum, line) => sum + line.lineAmount, 0),
    );

    if (totalAmount > 0) {
      await this.stockService.receiveStockIn(manager, {
        businessId,
        warehouseId: grn.warehouseId,
        vendorId: invoice.vendorId,
        referenceType: ReferenceType.PURCHASE_RETURN,
        batchDate: purchaseReturn.returnDate,
        batchNumberPrefix: purchaseReturn.returnNumber,
        lines: lines.map((line) => ({
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          purchaseUnitPrice: line.purchaseUnitPrice,
          saleUnitPrice: line.saleUnitPrice,
        })),
      });

      const inventory = await resolveInventoryControlAccount(manager, businessId);
      const description = `Purchase return ${purchaseReturn.returnNumber} reversal`;

      await this.transactionService.postJournal(manager, {
        businessId,
        referenceType: AccountTransactionReferenceType.PURCHASE_RETURN,
        referenceId: purchaseReturn.id,
        partyId: vendor.id,
        transactionDate: purchaseReturn.returnDate,
        description,
        lines: [
          {
            chartOfAccountId: vendor.payableAccountId,
            creditAmount: totalAmount,
            description,
          },
          {
            chartOfAccountId: inventory.id,
            debitAmount: totalAmount,
            description,
          },
        ],
      });
    }
  }

  async removeForOrderCascade(
    manager: EntityManager,
    businessId: string,
    purchaseReturn: PurchaseReturn,
  ): Promise<void> {
    await this.reverseApprovedEffects(manager, businessId, purchaseReturn);

    await manager
      .getRepository(PurchaseReturnItem)
      .delete({ purchaseReturnId: purchaseReturn.id });
    await manager.getRepository(PurchaseReturn).delete(purchaseReturn.id);
  }

  /**
   * Undoes approved return stock/ledger and marks the return rejected.
   * Used when cascading from purchase-order reverse (keeps the return row).
   */
  async reverseApprovedEffects(
    manager: EntityManager,
    businessId: string,
    purchaseReturn: PurchaseReturn,
  ): Promise<void> {
    if (purchaseReturn.status === PurchaseReturnStatus.APPROVED) {
      const invoice = await this.findPurchaseInvoiceForReturn(
        manager,
        businessId,
        purchaseReturn.purchaseInvoiceId,
      );
      const resolvedLines = this.resolvedLinesFromReturn(
        purchaseReturn,
        invoice,
      );
      const grn = invoice.grn as Grn;

      if (resolvedLines.length) {
        await this.stockService.receiveStockIn(manager, {
          businessId,
          warehouseId: grn.warehouseId,
          vendorId: invoice.vendorId,
          referenceType: ReferenceType.PURCHASE_RETURN,
          batchDate: purchaseReturn.returnDate,
          batchNumberPrefix: `${purchaseReturn.returnNumber}-REV`,
          lines: resolvedLines.map((line) => ({
            productId: line.productId,
            uomId: line.uomId,
            quantity: line.quantity,
            purchaseUnitPrice: line.purchaseUnitPrice,
            saleUnitPrice: line.saleUnitPrice,
          })),
        });
      }

      await this.transactionService.deleteLedgerEntriesByReference(manager, {
        businessId,
        referenceType: AccountTransactionReferenceType.PURCHASE_RETURN,
        referenceId: purchaseReturn.id,
      });
    }

    if (purchaseReturn.status !== PurchaseReturnStatus.REJECTED) {
      purchaseReturn.status = PurchaseReturnStatus.REJECTED;
      await manager.getRepository(PurchaseReturn).save(purchaseReturn);
    }
  }

  private resolvedLinesFromReturn(
    purchaseReturn: PurchaseReturn,
    invoice: PurchaseInvoice,
  ): ResolvedReturnLine[] {
    return (purchaseReturn.purchaseReturnItems ?? []).map((item) => {
      const invoiceItem = invoice.items?.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
      );
      if (!invoiceItem) {
        throw new BadRequestException(
          'Purchase return item no longer matches the source invoice',
        );
      }

      const grnItem = invoice.grn?.items?.find(
        (row) =>
          row.productId === item.productId &&
          row.uomId === item.uomId &&
          (row.productFlavourId ?? null) === (item.productFlavourId ?? null),
      );

      return {
        productId: item.productId,
        uomId: item.uomId,
        productFlavourId: item.productFlavourId ?? null,
        quantity: Number(item.quantity),
        lineAmount: this.lineAmountForQuantity(invoiceItem, Number(item.quantity)),
        purchaseUnitPrice: Number(invoiceItem.purchaseUnitPrice),
        saleUnitPrice: Number(grnItem?.saleUnitPrice ?? 0),
      };
    });
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePurchaseReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const invoice = await this.findPurchaseInvoiceForReturn(
      tenantDb,
      scopedBusinessId,
      dto.purchaseInvoiceId,
    );

    const created = await tenantDb.transaction(async (manager) => {
      const { purchaseReturn } = await this.persistNewPurchaseReturn(
        manager,
        scopedBusinessId,
        invoice,
        dto,
      );

      return manager.getRepository(PurchaseReturn).findOneOrFail({
        where: { id: purchaseReturn.id },
        relations: this.returnRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_CREATED',
      description: `Purchase return ${created.returnNumber} created`,
      metadata: {
        purchaseReturnId: created.id,
        purchaseInvoiceId: invoice.id,
        status: created.status,
      },
    });

    return { data: this.mapPurchaseReturn(created) };
  }

  async createAndApprove(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreatePurchaseReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const invoice = await this.findPurchaseInvoiceForReturn(
      tenantDb,
      scopedBusinessId,
      dto.purchaseInvoiceId,
    );

    const created = await tenantDb.transaction(async (manager) => {
      const { purchaseReturn, resolvedLines } =
        await this.persistNewPurchaseReturn(
          manager,
          scopedBusinessId,
          invoice,
          dto,
        );

      return this.executePurchaseReturnApproval(
        manager,
        scopedBusinessId,
        purchaseReturn,
        invoice,
        resolvedLines,
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_CREATED_AND_APPROVED',
      description: `Purchase return ${created.returnNumber} created and approved`,
      metadata: {
        purchaseReturnId: created.id,
        purchaseInvoiceId: invoice.id,
        status: created.status,
      },
    });

    return { data: this.mapPurchaseReturn(created) };
  }

  async approve(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const purchaseReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    this.assertPendingStatus(
      purchaseReturn,
      'Only pending purchase returns can be approved',
    );

    const invoice = await this.findPurchaseInvoiceForReturn(
      tenantDb,
      scopedBusinessId,
      purchaseReturn.purchaseInvoiceId,
    );
    const resolvedLines = this.resolvedLinesFromReturn(purchaseReturn, invoice);

    const approved = await tenantDb.transaction(async (manager) =>
      this.executePurchaseReturnApproval(
        manager,
        scopedBusinessId,
        purchaseReturn,
        invoice,
        resolvedLines,
      ),
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_APPROVED',
      description: `Purchase return ${approved.returnNumber} approved — stock issued, vendor payable reduced`,
      metadata: {
        purchaseReturnId: approved.id,
        purchaseInvoiceId: invoice.id,
      },
    });

    return { data: this.mapPurchaseReturn(approved) };
  }

  async bulkApprove(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: BulkApprovePurchaseReturnsDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const ids = [...new Set(dto.ids.map((id) => id.trim()).filter(Boolean))];

    if (!ids.length) {
      throw new BadRequestException(
        'At least one purchase return id is required',
      );
    }

    const results: Array<{
      id: string;
      returnNumber?: string;
      status: 'success' | 'error';
      message?: string;
      purchaseReturn?: ReturnType<PurchaseReturnService['mapPurchaseReturn']>;
    }> = [];

    let succeeded = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        const approved = await this.approve(
          tenantDb,
          scopedBusinessId,
          id,
          actorUserId,
        );
        succeeded += 1;
        results.push({
          id,
          returnNumber: approved.data.returnNumber,
          status: 'success',
          purchaseReturn: approved.data,
        });
      } catch (error) {
        failed += 1;
        let returnNumber: string | undefined;
        try {
          const existing = await tenantDb
            .getRepository(PurchaseReturn)
            .findOne({ where: { id }, select: ['id', 'returnNumber'] });
          returnNumber = existing?.returnNumber;
        } catch {
          // ignore lookup failure for error row label
        }
        results.push({
          id,
          returnNumber,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_BULK_APPROVED',
      description: `Bulk approve purchase returns finished. Succeeded: ${succeeded}, Failed: ${failed}`,
      metadata: {
        total: ids.length,
        succeeded,
        failed,
        ids,
      },
    });

    return {
      total: ids.length,
      succeeded,
      failed,
      results,
    };
  }

  async reject(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const purchaseReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );
    this.assertPendingStatus(
      purchaseReturn,
      'Only pending purchase returns can be rejected',
    );

    purchaseReturn.status = PurchaseReturnStatus.REJECTED;
    const rejected = await tenantDb
      .getRepository(PurchaseReturn)
      .save(purchaseReturn);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_REJECTED',
      description: `Purchase return ${rejected.returnNumber} rejected`,
      metadata: { purchaseReturnId: rejected.id },
    });

    return {
      message: 'Purchase return rejected',
      data: { id: rejected.id, returnNumber: rejected.returnNumber },
    };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    options: {
      page: number;
      limit: number;
      search?: string;
      purchaseInvoiceId?: string;
      status?: PurchaseReturnStatus;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, options.page);
    const limit = Math.max(1, options.limit);
    const skip = (page - 1) * limit;

    const qb = tenantDb
      .getRepository(PurchaseReturn)
      .createQueryBuilder('purchaseReturn')
      .leftJoinAndSelect('purchaseReturn.purchaseInvoice', 'purchaseInvoice')
      .leftJoinAndSelect('purchaseInvoice.items', 'invoiceItems')
      .leftJoinAndSelect('purchaseInvoice.vendor', 'vendor')
      .leftJoinAndSelect('purchaseInvoice.grn', 'grn')
      .leftJoinAndSelect('grn.items', 'grnItems')
      .leftJoinAndSelect('purchaseReturn.purchaseReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .where('purchaseReturn.businessId = :businessId', {
        businessId: scopedBusinessId,
      });

    if (options.purchaseInvoiceId) {
      qb.andWhere('purchaseReturn.purchaseInvoiceId = :purchaseInvoiceId', {
        purchaseInvoiceId: options.purchaseInvoiceId,
      });
    }
    if (options.status) {
      qb.andWhere('purchaseReturn.status = :status', {
        status: options.status,
      });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('purchaseReturn.returnNumber ILIKE :search', { search })
            .orWhere('purchaseReturn.returnReason ILIKE :search', { search })
            .orWhere('purchaseInvoice.invoiceNumber ILIKE :search', { search })
            .orWhere('vendor.name ILIKE :search', { search })
            .orWhere('vendor.code ILIKE :search', { search });
        }),
      );
    }

    const [[returns, total], analytics] = await Promise.all([
      qb
        .orderBy('purchaseReturn.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount(),
      this.listAnalyticsService.getDocumentAnalytics(
        tenantDb,
        scopedBusinessId,
        ListAnalyticsModule.PURCHASE_RETURN,
      ),
    ]);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_LISTED',
      description: 'Purchase returns listed',
      metadata: { total, page, limit },
    });

    return {
      data: returns.map((row) => this.mapPurchaseReturn(row)),
      meta: { total, page, limit },
      analytics,
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const purchaseReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_VIEWED',
      description: `Purchase return ${purchaseReturn.returnNumber} viewed`,
      metadata: { purchaseReturnId: purchaseReturn.id },
    });

    return { data: this.mapPurchaseReturn(purchaseReturn) };
  }

  async edit(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    dto: UpdatePurchaseReturnDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const purchaseReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );
    this.assertPendingStatus(
      purchaseReturn,
      'Only pending purchase returns can be modified',
    );

    const updated = await tenantDb.transaction(async (manager) => {
      const returnRepo = manager.getRepository(PurchaseReturn);

      if (dto.returnNumber !== undefined) {
        const nextNumber = dto.returnNumber.trim();
        if (!nextNumber) {
          throw new BadRequestException('Return number cannot be empty');
        }
        if (nextNumber !== purchaseReturn.returnNumber) {
          const taken = await returnRepo.findOne({
            where: { returnNumber: nextNumber },
          });
          if (taken) {
            throw new ConflictException(
              'Purchase return with this number already exists',
            );
          }
          purchaseReturn.returnNumber = nextNumber;
        }
      }

      if (dto.returnDate !== undefined) {
        purchaseReturn.returnDate = new Date(dto.returnDate);
      }
      if (dto.returnReason !== undefined) {
        purchaseReturn.returnReason = dto.returnReason.trim();
      }

      await returnRepo.save(purchaseReturn);

      return returnRepo.findOneOrFail({
        where: { id: purchaseReturn.id },
        relations: this.returnRelations(),
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_UPDATED',
      description: `Purchase return ${updated.returnNumber} updated`,
      metadata: { purchaseReturnId: updated.id },
    });

    return { data: this.mapPurchaseReturn(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    returnId: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const purchaseReturn = await this.findReturnForBusiness(
      tenantDb,
      scopedBusinessId,
      returnId,
    );

    if (purchaseReturn.status === PurchaseReturnStatus.APPROVED) {
      const invoice = await this.findPurchaseInvoiceForReturn(
        tenantDb,
        scopedBusinessId,
        purchaseReturn.purchaseInvoiceId,
      );
      const resolvedLines = this.resolvedLinesFromReturn(
        purchaseReturn,
        invoice,
      );

      await tenantDb.transaction(async (manager) => {
        await this.reverseReturnSideEffects(
          manager,
          scopedBusinessId,
          purchaseReturn,
          invoice,
          resolvedLines,
        );

        await manager
          .getRepository(PurchaseReturnItem)
          .delete({ purchaseReturnId: purchaseReturn.id });
        await manager.getRepository(PurchaseReturn).delete(purchaseReturn.id);
      });
    } else {
      await tenantDb.transaction(async (manager) => {
        await manager
          .getRepository(PurchaseReturnItem)
          .delete({ purchaseReturnId: purchaseReturn.id });
        await manager.getRepository(PurchaseReturn).delete(purchaseReturn.id);
      });
    }

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_DELETED',
      description: `Purchase return ${purchaseReturn.returnNumber} deleted`,
      metadata: { purchaseReturnId: purchaseReturn.id },
    });

    return {
      message: 'Purchase return deleted',
      data: {
        id: purchaseReturn.id,
        returnNumber: purchaseReturn.returnNumber,
      },
    };
  }

  private toJsonNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private formatReturnDateForJson(returnDate: Date | string): string {
    if (typeof returnDate === 'string') {
      return returnDate.slice(0, 10);
    }
    return returnDate.toISOString().slice(0, 10);
  }

  private mapPurchaseReturnToJsonItem(
    purchaseReturn: PurchaseReturn,
  ): PurchaseReturnJsonItemDto {
    return {
      returnNumber: purchaseReturn.returnNumber,
      returnDate: this.formatReturnDateForJson(purchaseReturn.returnDate),
      returnReason: purchaseReturn.returnReason,
      purchaseInvoiceNumber:
        purchaseReturn.purchaseInvoice?.invoiceNumber ?? '',
      items: (purchaseReturn.purchaseReturnItems ?? []).map((item) => ({
        skuCode: item.product?.skuCode ?? '',
        uomName: item.uom?.name ?? '',
        productFlavourName: item.productFlavour?.flavour?.name ?? null,
        quantity: this.toJsonNumber(item.quantity),
      })),
    };
  }

  async exportPurchaseReturnsJson(
    tenantDb: DataSource,
    businessId: string | undefined,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const returns = await tenantDb
      .getRepository(PurchaseReturn)
      .createQueryBuilder('purchaseReturn')
      .leftJoinAndSelect('purchaseReturn.purchaseInvoice', 'purchaseInvoice')
      .leftJoinAndSelect('purchaseReturn.purchaseReturnItems', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .where('purchaseReturn.businessId = :businessId', {
        businessId: scopedBusinessId,
      })
      .andWhere('purchaseReturn.status = :status', {
        status: PurchaseReturnStatus.APPROVED,
      })
      .orderBy('purchaseReturn.returnNumber', 'ASC')
      .addOrderBy('items.createdAt', 'ASC')
      .getMany();

    const items = returns.map((row) => this.mapPurchaseReturnToJsonItem(row));

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'PURCHASE_RETURN_JSON_EXPORTED',
      description: 'Approved purchase returns exported as JSON',
      metadata: {
        businessId: scopedBusinessId,
        count: items.length,
        status: PurchaseReturnStatus.APPROVED,
      },
    });

    return {
      format: SALESVINCE_EXPORT_FORMAT,
      version: 1,
      entity: JsonExportEntity.PURCHASE_RETURNS,
      exportedAt: new Date().toISOString(),
      items,
    };
  }

  private sanitizeJsonEmptyStrings(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJsonEmptyStrings(item));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>,
      )) {
        out[key] =
          nested === '' ? null : this.sanitizeJsonEmptyStrings(nested);
      }
      return out;
    }
    return value;
  }

  private formatJsonValidationErrors(
    errors: ReturnType<typeof validateSync>,
  ): string {
    const walk = (list: typeof errors, prefix = ''): string[] => {
      const messages: string[] = [];
      for (const error of list) {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        messages.push(
          ...Object.values(error.constraints ?? {}).map(
            (msg) => `${path}: ${msg}`,
          ),
        );
        if (error.children?.length) {
          messages.push(...walk(error.children, path));
        }
      }
      return messages;
    };
    return walk(errors).join('; ');
  }

  private parsePurchaseReturnJsonImportFile(
    file: Express.Multer.File,
  ): PurchaseReturnJsonImportDto {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'JSON file is required. Use multipart form-data field "file".',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON file');
    }

    const dto = plainToInstance(
      PurchaseReturnJsonImportDto,
      this.sanitizeJsonEmptyStrings(parsed),
      { enableImplicitConversion: true },
    );
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length) {
      throw new BadRequestException(
        this.formatJsonValidationErrors(errors) ||
          'Invalid purchase return JSON import payload',
      );
    }

    if (dto.entity && dto.entity !== JsonExportEntity.PURCHASE_RETURNS) {
      throw new BadRequestException(
        'entity must be "purchaseReturns" for purchase return JSON import',
      );
    }

    return dto;
  }

  private resolvePurchaseReturnJsonImportMode(
    fileMode: JsonImportMode | undefined,
    bodyMode?: string,
  ): JsonImportMode {
    const raw = bodyMode?.trim() || fileMode;
    if (!raw) {
      return JsonImportMode.CREATE_ONLY;
    }
    if (raw === JsonImportMode.UPSERT || raw === JsonImportMode.CREATE_ONLY) {
      return JsonImportMode.CREATE_ONLY;
    }
    throw new BadRequestException('mode must be upsert or createOnly');
  }

  private async findPurchaseInvoiceByNumberForJson(
    tenantDb: DataSource,
    businessId: string,
    invoiceNumber: string,
  ): Promise<PurchaseInvoice> {
    const invoice = await tenantDb.getRepository(PurchaseInvoice).findOne({
      where: {
        invoiceNumber,
        businessId,
        deletedAt: IsNull(),
      },
      relations: {
        items: {
          product: true,
          uom: true,
          productFlavour: { flavour: true },
        },
        vendor: true,
        grn: { items: true, warehouse: true },
      },
    });

    if (!invoice) {
      throw new NotFoundException(
        `Purchase invoice ${invoiceNumber} not found`,
      );
    }
    if (!invoice.grn) {
      throw new BadRequestException(
        `Purchase invoice ${invoiceNumber} must be linked to a GRN before creating a return`,
      );
    }
    if (!invoice.items?.length) {
      throw new BadRequestException(
        `Purchase invoice ${invoiceNumber} must have items to create a return`,
      );
    }

    return invoice;
  }

  private matchPurchaseInvoiceItemId(
    invoice: PurchaseInvoice,
    line: {
      skuCode: string;
      uomName: string;
      productFlavourName?: string | null;
    },
    lineIndex: number,
  ): string {
    const skuCode = line.skuCode.trim();
    const uomName = line.uomName.trim();
    const flavourName = line.productFlavourName?.trim() || null;

    const matches = (invoice.items ?? []).filter((item) => {
      const itemSku = item.product?.skuCode?.trim();
      const itemUom = item.uom?.name?.trim();
      const itemFlavour = item.productFlavour?.flavour?.name?.trim() || null;
      return (
        itemSku === skuCode &&
        itemUom === uomName &&
        itemFlavour === flavourName
      );
    });

    if (!matches.length) {
      throw new NotFoundException(
        `Line ${lineIndex + 1}: no invoice item for SKU ${skuCode} / UOM ${uomName}` +
          (flavourName ? ` / flavour ${flavourName}` : ''),
      );
    }

    return matches[0].id;
  }

  private async buildCreateDtoFromJsonItem(
    tenantDb: DataSource,
    businessId: string,
    item: PurchaseReturnJsonItemDto,
  ): Promise<CreatePurchaseReturnDto> {
    const invoice = await this.findPurchaseInvoiceByNumberForJson(
      tenantDb,
      businessId,
      item.purchaseInvoiceNumber.trim(),
    );

    const lineItems: CreatePurchaseReturnItemDto[] = item.items.map(
      (line, lineIndex) => ({
        purchaseInvoiceItemId: this.matchPurchaseInvoiceItemId(
          invoice,
          line,
          lineIndex,
        ),
        quantity: line.quantity,
      }),
    );

    return {
      purchaseInvoiceId: invoice.id,
      returnNumber: item.returnNumber.trim(),
      returnDate: item.returnDate,
      returnReason: item.returnReason,
      items: lineItems,
    };
  }

  private async notifyPurchaseReturnJsonImportCompletion(
    tenantDb: DataSource,
    job: TenantJob,
    user: { userId: string; businessId: string },
    tenantCode: string,
    status: 'completed' | 'failed',
  ) {
    const title =
      status === 'completed'
        ? 'Purchase return JSON import completed'
        : 'Purchase return JSON import failed';
    const message =
      status === 'completed'
        ? `Import finished. Inserted: ${job.inserted}, Failed: ${job.failed}, Total: ${job.totalRows}`
        : `Import failed for ${job.fileName}. Please review import logs.`;

    await this.notificationService.createNotification(
      tenantDb,
      {
        userId: user.userId,
        title,
        businessId: user.businessId,
        message,
        type: 'purchase_return_json_import',
      },
      tenantCode,
      {
        job: {
          id: job.id,
          jobType: job.jobType,
          status,
          fileName: job.fileName,
          totalRows: job.totalRows,
          inserted: job.inserted,
          failed: job.failed,
          completedAt: job.completedAt,
          logs: job.logs,
        },
      },
    );
  }

  private async processPurchaseReturnJsonImportJob(
    tenantDb: DataSource,
    jobId: string,
    items: PurchaseReturnJsonItemDto[],
    mode: JsonImportMode,
    user: { userId: string; businessId: string },
    tenantCode: string,
  ) {
    this.tenantJobService.startJob(jobId);
    const scopedBusinessId = user.businessId;
    let created = 0;
    let skipped = 0;

    for (const [index, item] of items.entries()) {
      const key = item.returnNumber?.trim() || `row-${index + 1}`;
      try {
        const returnNumber = item.returnNumber.trim();
        const existing = await tenantDb.getRepository(PurchaseReturn).findOne({
          where: { returnNumber },
          select: ['id', 'returnNumber'],
        });

        if (existing) {
          skipped += 1;
          this.tenantJobService.appendLog(jobId, {
            row: index + 1,
            name: key,
            status: 'error',
            error: `Purchase return ${returnNumber} already exists`,
            metadata: {
              outcome: 'skipped',
              purchaseReturnId: existing.id,
              mode,
            },
          });
          continue;
        }

        const createDto = await this.buildCreateDtoFromJsonItem(
          tenantDb,
          scopedBusinessId,
          item,
        );
        const createdReturn = await this.create(
          tenantDb,
          scopedBusinessId,
          createDto,
          user.userId,
        );
        created += 1;
        this.tenantJobService.appendLog(jobId, {
          row: index + 1,
          name: createdReturn.data.returnNumber,
          status: 'success',
          metadata: {
            outcome: 'created',
            purchaseReturnId: createdReturn.data.id,
            returnNumber: createdReturn.data.returnNumber,
            status: createdReturn.data.status,
          },
        });
      } catch (error) {
        this.tenantJobService.appendLog(jobId, {
          row: index + 1,
          name: key,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const completedJob = this.tenantJobService.completeJob(jobId);

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_COMPLETED',
      description: `Purchase return JSON import completed for ${completedJob.fileName}`,
      metadata: {
        jobId: completedJob.id,
        jobType: completedJob.jobType,
        fileName: completedJob.fileName,
        totalRows: completedJob.totalRows,
        inserted: completedJob.inserted,
        failed: completedJob.failed,
        created,
        skipped,
        mode,
      },
    });

    await this.notifyPurchaseReturnJsonImportCompletion(
      tenantDb,
      completedJob,
      user,
      tenantCode,
      'completed',
    );
  }

  async importPurchaseReturnsJson(
    tenantDb: DataSource,
    file: Express.Multer.File,
    user: { userId: string; businessId: string },
    tenantCode: string,
    bodyMode?: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(user.businessId);
    const dto = this.parsePurchaseReturnJsonImportFile(file);
    const mode = this.resolvePurchaseReturnJsonImportMode(
      dto.options?.mode,
      bodyMode,
    );

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId: scopedBusinessId,
      jobType: 'PURCHASE_RETURN_JSON_IMPORT',
      fileName: file.originalname || 'purchase-returns.json',
      createdBy: user.userId,
      totalRows: dto.items.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId: scopedBusinessId,
      action: 'TENANT_JOB_STARTED',
      description: `Purchase return JSON import started for ${job.fileName}`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        fileName: job.fileName,
        totalRows: job.totalRows,
        mode,
      },
    });

    void this.processPurchaseReturnJsonImportJob(
      tenantDb,
      job.id,
      dto.items,
      mode,
      user,
      tenantCode,
    ).catch(async (error) => {
      this.tenantJobService.failJob(job.id);
      this.tenantJobService.appendLog(job.id, {
        row: 0,
        name: '',
        status: 'error',
        error:
          error instanceof Error ? error.message : 'Unknown processing failure',
      });
      const failedJob = this.tenantJobService.getJobById(
        job.id,
        tenantCode,
        user.userId,
      );

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: user.userId,
        businessId: scopedBusinessId,
        action: 'TENANT_JOB_FAILED',
        description: `Purchase return JSON import failed for ${job.fileName}`,
        metadata: {
          jobId: job.id,
          jobType: job.jobType,
          fileName: job.fileName,
          error: error instanceof Error ? error.message : String(error),
          mode,
        },
      });
      await this.notifyPurchaseReturnJsonImportCompletion(
        tenantDb,
        failedJob,
        user,
        tenantCode,
        'failed',
      );
    });

    return {
      message: 'Purchase return JSON import started',
      jobId: job.id,
      status: job.status,
      totalRows: job.totalRows,
      mode,
    };
  }
}
