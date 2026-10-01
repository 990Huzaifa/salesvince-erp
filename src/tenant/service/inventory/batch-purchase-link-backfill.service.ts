import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Batch } from 'src/tenant-db/entities/stock.entity';
import { Grn, GrnItem } from 'src/tenant-db/entities/grn.entity';
import { PurchaseInvoice } from 'src/tenant-db/entities/purchase-invoice.entity';
import type { TenantRequestUser } from 'src/auth/tenant-jwt.strategy';
import { ActivityLogService } from '../activity-log.service';
import { TenantJobService } from '../tenant-job.service';

const GRN_BATCH_NUMBER_PATTERN =
  /^(GRN-\d+)-([0-9a-fA-F]{8})-([0-9a-fA-F]{8})-(\d+)$/;

@Injectable()
export class BatchPurchaseLinkBackfillService {
  private readonly logger = new Logger(BatchPurchaseLinkBackfillService.name);

  constructor(
    private readonly tenantJobService: TenantJobService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  async startBackfill(
    tenantDb: DataSource,
    tenantCode: string,
    user: TenantRequestUser,
  ) {
    const businessId = this.assertBusinessId(user.businessId);

    const candidates = await tenantDb.getRepository(Batch).find({
      where: [
        {
          businessId,
          deletedAt: IsNull(),
          grnId: IsNull(),
        },
        {
          businessId,
          deletedAt: IsNull(),
          purchasedQty: IsNull(),
        },
        {
          businessId,
          deletedAt: IsNull(),
          purchaseInvoiceId: IsNull(),
        },
      ],
      order: { createdAt: 'ASC' },
      select: {
        id: true,
        batchNumber: true,
        productId: true,
        uomId: true,
        grnId: true,
        purchasedQty: true,
        purchaseInvoiceId: true,
      },
    });

    const grnBatches = candidates.filter((batch) =>
      GRN_BATCH_NUMBER_PATTERN.test(batch.batchNumber),
    );

    // Dedupe OR where results
    const uniqueById = new Map(grnBatches.map((batch) => [batch.id, batch]));
    const batches = [...uniqueById.values()];

    const job = this.tenantJobService.createJob({
      tenantCode,
      businessId,
      jobType: 'BATCH_PURCHASE_LINK_BACKFILL',
      fileName: 'batch-purchase-link-backfill',
      createdBy: user.userId,
      totalRows: batches.length,
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: user.userId,
      businessId,
      action: 'TENANT_JOB_STARTED',
      description: `Batch purchase-link backfill started (${batches.length} GRN batches)`,
      metadata: {
        jobId: job.id,
        jobType: job.jobType,
        candidateCount: batches.length,
      },
      jobId: job.id,
    });

    void this.processBackfill(tenantDb, job.id, businessId, batches).catch(
      (error) => {
        this.logger.error(
          `Batch purchase-link backfill job ${job.id} failed unexpectedly`,
          error instanceof Error ? error.stack : undefined,
        );
      },
    );

    return {
      message: 'Batch purchase-link backfill started',
      jobId: job.id,
      status: job.status,
      candidateCount: batches.length,
    };
  }

  private async processBackfill(
    tenantDb: DataSource,
    jobId: string,
    businessId: string,
    batches: Batch[],
  ) {
    this.tenantJobService.startJob(jobId);

    let linked = 0;
    let skipped = 0;

    try {
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const row = index + 1;

        try {
          const result = await this.linkBatch(tenantDb, businessId, batch);
          if (result.status === 'linked') {
            linked += 1;
            this.tenantJobService.appendLog(jobId, {
              row,
              name: batch.batchNumber,
              status: 'success',
              metadata: result.metadata,
            });
          } else {
            skipped += 1;
            this.tenantJobService.appendLog(jobId, {
              row,
              name: batch.batchNumber,
              status: 'error',
              error: result.reason,
              metadata: result.metadata,
            });
          }
        } catch (error) {
          skipped += 1;
          this.tenantJobService.appendLog(jobId, {
            row,
            name: batch.batchNumber,
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'Unexpected backfill error',
          });
        }
      }

      this.tenantJobService.completeJob(jobId);

      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: null,
        businessId,
        action: 'TENANT_JOB_COMPLETED',
        description: `Batch purchase-link backfill completed (linked=${linked}, skipped=${skipped})`,
        metadata: {
          jobId,
          jobType: 'BATCH_PURCHASE_LINK_BACKFILL',
          linked,
          skipped,
          total: batches.length,
        },
        jobId,
      });
    } catch (error) {
      this.tenantJobService.failJob(jobId);
      await this.activityLogService.recordActivityLog(tenantDb, {
        actorId: null,
        businessId,
        action: 'TENANT_JOB_FAILED',
        description: `Batch purchase-link backfill failed`,
        metadata: {
          jobId,
          jobType: 'BATCH_PURCHASE_LINK_BACKFILL',
          error: error instanceof Error ? error.message : String(error),
        },
        jobId,
      });
      throw error;
    }
  }

  private async linkBatch(
    tenantDb: DataSource,
    businessId: string,
    batch: Batch,
  ): Promise<{
    status: 'linked' | 'skipped';
    reason?: string;
    metadata?: Record<string, unknown>;
  }> {
    const fresh = await tenantDb.getRepository(Batch).findOne({
      where: { id: batch.id, businessId, deletedAt: IsNull() },
    });

    if (!fresh) {
      return { status: 'skipped', reason: 'Batch not found' };
    }

    if (
      fresh.grnId &&
      fresh.purchasedQty != null &&
      fresh.purchaseInvoiceId
    ) {
      return {
        status: 'skipped',
        reason: 'Already linked',
        metadata: {
          grnId: fresh.grnId,
          purchaseInvoiceId: fresh.purchaseInvoiceId,
          purchasedQty: fresh.purchasedQty,
        },
      };
    }

    const match = GRN_BATCH_NUMBER_PATTERN.exec(fresh.batchNumber);
    if (!match) {
      return { status: 'skipped', reason: 'Batch number is not a GRN batch' };
    }

    const [, grnNumber, productPrefix, uomPrefix] = match;

    if (
      fresh.productId.slice(0, 8).toLowerCase() !== productPrefix.toLowerCase() ||
      fresh.uomId.slice(0, 8).toLowerCase() !== uomPrefix.toLowerCase()
    ) {
      return {
        status: 'skipped',
        reason: 'Batch number product/uom prefix mismatch',
        metadata: { grnNumber, productPrefix, uomPrefix },
      };
    }

    const grn = await tenantDb.getRepository(Grn).findOne({
      where: {
        grnNumber,
        businessId,
        deletedAt: IsNull(),
      },
    });

    if (!grn) {
      return {
        status: 'skipped',
        reason: `GRN not found for ${grnNumber}`,
        metadata: { grnNumber },
      };
    }

    const grnItems = await tenantDb.getRepository(GrnItem).find({
      where: {
        grnId: grn.id,
        productId: fresh.productId,
        uomId: fresh.uomId,
      },
      order: { createdAt: 'ASC' },
    });

    if (!grnItems.length) {
      return {
        status: 'skipped',
        reason: 'No matching GRN line for product/uom',
        metadata: { grnId: grn.id, grnNumber },
      };
    }

    if (grnItems.length > 1) {
      this.logger.warn(
        `Multiple GRN lines for batch ${fresh.batchNumber}; using first by createdAt`,
      );
    }

    const grnItem = grnItems[0];
    const invoice = await tenantDb.getRepository(PurchaseInvoice).findOne({
      where: {
        grnId: grn.id,
        businessId,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    const patch: Partial<Batch> = {};
    if (!fresh.grnId) {
      patch.grnId = grn.id;
    }
    if (fresh.purchasedQty == null) {
      patch.purchasedQty = Number(grnItem.receivedQuantity);
    }
    if (!fresh.purchaseInvoiceId && invoice) {
      patch.purchaseInvoiceId = invoice.id;
    }

    if (!Object.keys(patch).length) {
      return {
        status: 'skipped',
        reason: 'Nothing to update',
        metadata: {
          grnId: fresh.grnId,
          purchaseInvoiceId: fresh.purchaseInvoiceId,
          purchasedQty: fresh.purchasedQty,
        },
      };
    }

    await tenantDb.getRepository(Batch).update({ id: fresh.id }, patch);

    return {
      status: 'linked',
      metadata: {
        grnId: patch.grnId ?? fresh.grnId,
        grnNumber,
        purchaseInvoiceId: patch.purchaseInvoiceId ?? fresh.purchaseInvoiceId,
        purchasedQty: patch.purchasedQty ?? fresh.purchasedQty,
        receivedQuantity: Number(grnItem.receivedQuantity),
        purchaseOrderId: grn.purchaseOrderId,
      },
    };
  }
}
