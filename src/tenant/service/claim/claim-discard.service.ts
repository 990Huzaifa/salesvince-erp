import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Claim,
  ClaimDiscardType,
  ClaimItem,
  ClaimItemUnitOutcome,
} from 'src/tenant-db/entities/claim/claim.entity';
import {
  ClaimDiscard,
  ClaimDiscardDocStatus,
  ClaimDiscardItem,
} from 'src/tenant-db/entities/claim/claim-discards.entity';
import { CancelClaimDocDto } from '../../dto/claim/cancel-claim-doc.dto';
import { CreateClaimDiscardDto } from '../../dto/claim/create-claim-discard.dto';
import { ActivityLogService } from '../activity-log.service';
import { ClaimStockService } from './claim-stock.service';
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
export class ClaimDiscardService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly claimStockService: ClaimStockService,
  ) {}

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
      .getRepository(ClaimDiscard)
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.claim', 'claim')
      .leftJoinAndSelect('d.items', 'items')
      .where('d.id = :id', { id })
      .andWhere('claim.businessId = :businessId', { businessId })
      .getOne();
    if (!row) throw new NotFoundException('Claim discard not found');
    return row;
  }

  /** Create + post discard in one step (qty ≤ To send). */
  async createAndPost(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimDiscardDto,
    actorUserId: string,
  ) {
    const scoped = assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaim(manager, scoped, dto.claimId);
      const byId = new Map((claim.items ?? []).map((i) => [i.id, i]));
      const discardId = randomUUID();
      const discardNumber = await generateDocNumber(
        manager,
        ClaimDiscard,
        'discardNumber',
        'CDC',
        claim.claimNumber,
      );

      await manager.query(
        `
        INSERT INTO claim_discards (
          "id", "discardNumber", "discardDate", "claimId", "status",
          "notes", "createdBy", "cancelledAt", "cancelReason"
        ) VALUES (
          $1::uuid, $2, $3::date, $4::uuid,
          $5::claim_discards_status_enum,
          $6, $7::uuid, NULL, NULL
        )
        `,
        [
          discardId,
          discardNumber,
          new Date(dto.discardDate || new Date()),
          claim.id,
          ClaimDiscardDocStatus.POSTED,
          dto.notes?.trim() || null,
          actorUserId,
        ],
      );

      const consume: Array<{ item: ClaimItem; quantity: number }> = [];

      for (const line of dto.items) {
        const item = byId.get(line.claimItemId);
        if (!item) {
          throw new BadRequestException(
            `Claim item ${line.claimItemId} not on this claim`,
          );
        }
        const qty = roundQty(line.quantity);
        const { toSend } = balancesOf(item);
        if (qty > toSend) {
          throw new BadRequestException(
            `Discard qty ${qty} exceeds To send ${toSend} for item ${item.id}`,
          );
        }
        if (!line.reason?.trim() && !line.discardReasonId) {
          throw new BadRequestException('Discard reason is required');
        }

        const batch =
          (item.batches ?? []).find((b) => !b.deletedAt && Number(b.quantity) > 0) ??
          (item.batches ?? []).find((b) => !b.deletedAt);

        await manager.query(
          `
          INSERT INTO claim_discard_items (
            "id", "discardId", "claimItemId", "claimBatchId", "warehouseId",
            "productId", "productFlavourId", "uomId", "quantity",
            "discardReasonId", "reason", "action", "notes"
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
            $6::uuid, $7::uuid, $8::uuid, $9::int,
            $10::uuid, $11, $12::claim_discard_items_action_enum, $13
          )
          `,
          [
            randomUUID(),
            discardId,
            item.id,
            batch?.id ?? null,
            item.warehouseId,
            item.productId,
            item.productFlavourId,
            item.uomId,
            qty,
            line.discardReasonId ?? null,
            line.reason?.trim() || null,
            line.action ?? ClaimDiscardType.AS_IS,
            line.notes?.trim() || null,
          ],
        );

        await bumpClaimItemQty(manager, item.id, { qtyDiscarded: qty });
        await setClaimItemOutcome(
          manager,
          item.id,
          ClaimItemUnitOutcome.DISCARDED,
          {
            discardType: line.action ?? ClaimDiscardType.AS_IS,
            discardReason: line.reason?.trim() || null,
          },
        );
        consume.push({ item, quantity: qty });
      }

      await this.claimStockService.consumeClaimItems(manager, scoped, consume);
      await refreshClaimStatusFromBalances(manager, claim.id);
      return this.loadOrFail(manager, scoped, discardId);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scoped,
      action: 'CLAIM_DISCARD_POSTED',
      description: `Claim discard ${created.discardNumber} posted`,
      metadata: { discardId: created.id, claimId: created.claimId },
    });

    return { data: created };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: { page?: number; limit?: number; claimId?: string },
  ) {
    const scoped = assertBusinessId(businessId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = tenantDb
      .getRepository(ClaimDiscard)
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.claim', 'claim')
      .where('claim.businessId = :businessId', { businessId: scoped })
      .orderBy('d.discardDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.claimId) {
      qb.andWhere('d.claimId = :claimId', { claimId: query.claimId });
    }
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows, meta: { total, page, limit } };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
  ) {
    const scoped = assertBusinessId(businessId);
    return { data: await this.loadOrFail(tenantDb, scoped, id) };
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
      if (doc.status !== ClaimDiscardDocStatus.POSTED) {
        throw new BadRequestException('Only POSTED discards can be cancelled');
      }

      const items = await manager.getRepository(ClaimDiscardItem).find({
        where: { discardId: doc.id },
        relations: ['claimItem'],
      });

      for (const line of items) {
        await bumpClaimItemQty(manager, line.claimItemId, {
          qtyDiscarded: -roundQty(line.quantity),
        });
      }

      await this.claimStockService.restoreClaimItems(
        manager,
        scoped,
        items.map((line) => ({
          claimItemId: line.claimItemId,
          claimBatchId: line.claimBatchId,
          quantity: line.quantity,
        })),
      );

      await manager.query(
        `
        UPDATE claim_discards
        SET "status" = $1::claim_discards_status_enum,
            "cancelledAt" = CURRENT_TIMESTAMP,
            "cancelReason" = $2,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $3::uuid
        `,
        [
          ClaimDiscardDocStatus.CANCELLED,
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
      action: 'CLAIM_DISCARD_CANCELLED',
      description: `Claim discard ${cancelled.discardNumber} cancelled`,
      metadata: { discardId: cancelled.id },
    });

    return { data: cancelled };
  }
}
