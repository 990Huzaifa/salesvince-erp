import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Claim,
  ClaimItemUnitOutcome,
} from 'src/tenant-db/entities/claim/claim.entity';
import {
  ClaimVendorReceipt,
  ClaimVendorReceiptDocStatus,
  ClaimVendorReceiptItem,
} from 'src/tenant-db/entities/claim/claim-vendor-receipts.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { CancelClaimDocDto } from '../../dto/claim/cancel-claim-doc.dto';
import { CreateClaimVendorReceiptDto } from '../../dto/claim/create-claim-vendor-receipt.dto';
import { ActivityLogService } from '../activity-log.service';
import {
  assertBusinessId,
  balancesOf,
  bumpClaimItemQty,
  generateDocNumber,
  refreshClaimStatusFromBalances,
  roundQty,
  setClaimItemOutcome,
} from './claim-qty.helper';

@Injectable()
export class ClaimVendorReceiptService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private async loadClaim(
    manager: EntityManager,
    businessId: string,
    claimId: string,
  ) {
    const claim = await manager
      .getRepository(Claim)
      .createQueryBuilder('claim')
      .leftJoinAndSelect('claim.items', 'items')
      .leftJoinAndSelect('items.batches', 'batches')
      .where('claim.id = :claimId', { claimId })
      .andWhere('claim.businessId = :businessId', { businessId })
      .getOne();
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  private async loadOrFail(
    manager: EntityManager | DataSource,
    businessId: string,
    id: string,
  ) {
    const row = await manager
      .getRepository(ClaimVendorReceipt)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.claim', 'claim')
      .leftJoinAndSelect('r.vendor', 'vendor')
      .leftJoinAndSelect('r.warehouse', 'warehouse')
      .leftJoinAndSelect('r.items', 'items')
      .where('r.id = :id', { id })
      .andWhere('claim.businessId = :businessId', { businessId })
      .getOne();
    if (!row) throw new NotFoundException('Claim vendor receipt not found');
    return row;
  }

  async createAndPost(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimVendorReceiptDto,
    actorUserId: string,
  ) {
    const scoped = assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaim(manager, scoped, dto.claimId);
      const vendor = await manager.getRepository(Party).findOne({
        where: { id: dto.vendorId, businessId: scoped },
      });
      if (!vendor || vendor.type === PartyType.CUSTOMER) {
        throw new BadRequestException('Valid vendor is required');
      }
      const wh = await manager.getRepository(Warehouse).findOne({
        where: { id: dto.warehouseId, businessId: scoped },
      });
      if (!wh) throw new NotFoundException('Warehouse not found');

      const byId = new Map((claim.items ?? []).map((i) => [i.id, i]));
      const receiptId = randomUUID();
      const receiptNumber = await generateDocNumber(
        manager,
        ClaimVendorReceipt,
        'receiptNumber',
        'CVR',
        claim.claimNumber,
      );

      await manager.query(
        `
        INSERT INTO claim_vendor_receipts (
          "id", "receiptNumber", "receiptDate", "claimId", "vendorId",
          "warehouseId", "status", "notes", "proofImage", "createdBy"
        ) VALUES (
          $1::uuid, $2, $3::date, $4::uuid, $5::uuid,
          $6::uuid, $7::claim_vendor_receipts_status_enum, $8, $9, $10::uuid
        )
        `,
        [
          receiptId,
          receiptNumber,
          new Date(dto.receiptDate || new Date()),
          claim.id,
          dto.vendorId,
          dto.warehouseId,
          ClaimVendorReceiptDocStatus.POSTED,
          dto.notes?.trim() || null,
          dto.proofImage?.trim() || null,
          actorUserId,
        ],
      );

      for (const line of dto.items) {
        const accepted = roundQty(line.acceptedQuantity);
        const rejected = roundQty(line.rejectedQuantity);
        if (accepted + rejected <= 0) {
          throw new BadRequestException(
            'Each receipt line needs accepted or rejected qty',
          );
        }
        const item = byId.get(line.claimItemId);
        if (!item) {
          throw new BadRequestException(
            `Claim item ${line.claimItemId} not on this claim`,
          );
        }
        const { atVendor } = balancesOf(item);
        if (accepted + rejected > atVendor) {
          throw new BadRequestException(
            `Accepted+Rejected ${accepted + rejected} exceeds At vendor ${atVendor}`,
          );
        }
        if (rejected > 0 && !line.rejectReason?.trim() && !line.rejectReasonId) {
          throw new BadRequestException('Reject reason required when rejected');
        }

        const batch =
          (item.batches ?? []).find((b) => !b.deletedAt) ?? null;

        await manager.query(
          `
          INSERT INTO claim_vendor_receipt_items (
            "id", "receiptId", "claimItemId", "claimBatchId", "shipmentItemId",
            "warehouseId", "productId", "productFlavourId", "uomId",
            "acceptedQuantity", "rejectedQuantity", "returnType", "creditAmount",
            "rejectReasonId", "rejectReason", "rejectedAction", "notes"
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
            $6::uuid, $7::uuid, $8::uuid, $9::uuid,
            $10::int, $11::int, $12::claim_vendor_receipt_items_returntype_enum, $13,
            $14::uuid, $15, $16::claim_vendor_receipt_items_rejectedaction_enum, $17
          )
          `,
          [
            randomUUID(),
            receiptId,
            item.id,
            batch?.id ?? null,
            line.shipmentItemId ?? null,
            dto.warehouseId,
            item.productId,
            item.productFlavourId,
            item.uomId,
            accepted,
            rejected,
            line.returnType ?? null,
            line.creditAmount != null ? String(line.creditAmount) : null,
            line.rejectReasonId ?? null,
            line.rejectReason?.trim() || null,
            line.rejectedAction ?? null,
            line.notes?.trim() || null,
          ],
        );

        await bumpClaimItemQty(manager, item.id, {
          qtyReceived: accepted,
          qtyRejected: rejected,
        });

        if (accepted > 0 && rejected === 0) {
          await setClaimItemOutcome(
            manager,
            item.id,
            ClaimItemUnitOutcome.VENDOR_ACCEPTED,
          );
        } else if (rejected > 0 && accepted === 0) {
          await setClaimItemOutcome(
            manager,
            item.id,
            ClaimItemUnitOutcome.VENDOR_REJECTED,
            {
              discardType: line.rejectedAction ?? null,
              discardReason: line.rejectReason?.trim() || null,
            },
          );
        }
      }

      await manager.query(
        `
        UPDATE claims SET "vendorId" = $1::uuid, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $2::uuid
        `,
        [dto.vendorId, claim.id],
      );

      await refreshClaimStatusFromBalances(manager, claim.id);
      return this.loadOrFail(manager, scoped, receiptId);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scoped,
      action: 'CLAIM_VENDOR_RECEIPT_POSTED',
      description: `Claim vendor receipt ${created.receiptNumber} posted`,
      metadata: { receiptId: created.id, claimId: created.claimId },
    });

    return { data: created };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: { page?: number; limit?: number; claimId?: string; vendorId?: string },
  ) {
    const scoped = assertBusinessId(businessId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = tenantDb
      .getRepository(ClaimVendorReceipt)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.claim', 'claim')
      .leftJoinAndSelect('r.vendor', 'vendor')
      .leftJoinAndSelect('r.warehouse', 'warehouse')
      .where('claim.businessId = :businessId', { businessId: scoped })
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.claimId) {
      qb.andWhere('claim.id = :claimId', { claimId: query.claimId });
    }
    if (query.vendorId) {
      qb.andWhere('vendor.id = :vendorId', { vendorId: query.vendorId });
    }
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows, meta: { total, page, limit } };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
  ) {
    return {
      data: await this.loadOrFail(
        tenantDb,
        assertBusinessId(businessId),
        id,
      ),
    };
  }

  async cancel(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: CancelClaimDocDto,
    actorUserId: string,
  ) {
    const scoped = assertBusinessId(businessId);
    const cancelled = await tenantDb.transaction(async (manager) => {
      const doc = await this.loadOrFail(manager, scoped, id);
      if (doc.status !== ClaimVendorReceiptDocStatus.POSTED) {
        throw new BadRequestException('Only POSTED receipts can be cancelled');
      }
      const items = await manager.getRepository(ClaimVendorReceiptItem).find({
        where: { receiptId: doc.id },
      });
      for (const line of items) {
        await bumpClaimItemQty(manager, line.claimItemId, {
          qtyReceived: -roundQty(line.acceptedQuantity),
          qtyRejected: -roundQty(line.rejectedQuantity),
        });
      }
      await manager.query(
        `
        UPDATE claim_vendor_receipts
        SET "status" = $1::claim_vendor_receipts_status_enum,
            "cancelledAt" = CURRENT_TIMESTAMP,
            "cancelReason" = $2,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $3::uuid
        `,
        [
          ClaimVendorReceiptDocStatus.CANCELLED,
          dto.reason?.trim() || null,
          doc.id,
        ],
      );
      await refreshClaimStatusFromBalances(manager, doc.claimId);
      return this.loadOrFail(manager, scoped, doc.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scoped,
      action: 'CLAIM_VENDOR_RECEIPT_CANCELLED',
      description: `Claim vendor receipt ${cancelled.receiptNumber} cancelled`,
      metadata: { receiptId: cancelled.id },
    });

    return { data: cancelled };
  }
}
