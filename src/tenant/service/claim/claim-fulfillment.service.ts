import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Claim,
  ClaimItem,
  ClaimItemUnitOutcome,
  ClaimSourceType,
} from 'src/tenant-db/entities/claim/claim.entity';
import {
  ClaimFulfillment,
  ClaimFulfillmentDocStatus,
  ClaimFulfillmentItem,
  ClaimFulfillmentType,
} from 'src/tenant-db/entities/claim/claim-fulfillments.entity';
import { CancelClaimDocDto } from '../../dto/claim/cancel-claim-doc.dto';
import { CreateClaimFulfillmentDto } from '../../dto/claim/create-claim-fulfillment.dto';
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
export class ClaimFulfillmentService {
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
      .getRepository(ClaimFulfillment)
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.claim', 'claim')
      .leftJoinAndSelect('f.party', 'party')
      .leftJoinAndSelect('f.warehouse', 'warehouse')
      .leftJoinAndSelect('f.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'itemWarehouse')
      .leftJoinAndSelect('items.claimBatch', 'claimBatch')
      .leftJoinAndSelect('items.claimItem', 'claimItem')
      .where('f.id = :id', { id })
      .andWhere('claim.businessId = :businessId', { businessId })
      .getOne();
    if (!row) throw new NotFoundException('Claim fulfillment not found');
    return row;
  }

  async createAndPost(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimFulfillmentDto,
    actorUserId: string,
  ) {
    const scoped = assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaim(manager, scoped, dto.claimId);

      if (dto.type === ClaimFulfillmentType.DELIVER_TO_CUSTOMER) {
        if (claim.sourceType !== ClaimSourceType.CUSTOMER) {
          throw new BadRequestException(
            'DELIVER_TO_CUSTOMER only for CUSTOMER claims',
          );
        }
      } else if (claim.sourceType !== ClaimSourceType.OWN_LOCATION) {
        throw new BadRequestException(
          'RETURN_TO_LOCATION only for OWN_LOCATION claims',
        );
      }

      const partyId =
        dto.partyId ??
        (dto.type === ClaimFulfillmentType.DELIVER_TO_CUSTOMER
          ? claim.partyId
          : null);
      const warehouseId =
        dto.warehouseId ??
        (dto.type === ClaimFulfillmentType.RETURN_TO_LOCATION
          ? claim.warehouseId
          : null);

      const byId = new Map((claim.items ?? []).map((i) => [i.id, i]));
      const fulfillmentId = randomUUID();
      const fulfillmentNumber = await generateDocNumber(
        manager,
        ClaimFulfillment,
        'fulfillmentNumber',
        'CFF',
        claim.claimNumber,
      );

      await manager.query(
        `
        INSERT INTO claim_fulfillments (
          "id", "fulfillmentNumber", "fulfillmentDate", "claimId", "type",
          "status", "partyId", "warehouseId", "receivedByName",
          "signatureImage", "proofImage", "notes", "createdBy"
        ) VALUES (
          $1::uuid, $2, $3::date, $4::uuid, $5::claim_fulfillments_type_enum,
          $6::claim_fulfillments_status_enum, $7::uuid, $8::uuid, $9,
          $10, $11, $12, $13::uuid
        )
        `,
        [
          fulfillmentId,
          fulfillmentNumber,
          new Date(dto.fulfillmentDate || new Date()),
          claim.id,
          dto.type,
          ClaimFulfillmentDocStatus.POSTED,
          partyId,
          warehouseId,
          dto.receivedByName?.trim() || null,
          dto.signatureImage?.trim() || null,
          dto.proofImage?.trim() || null,
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
        const { readyToGive } = balancesOf(item);
        if (qty > readyToGive) {
          throw new BadRequestException(
            `Give qty ${qty} exceeds Ready to give ${readyToGive}`,
          );
        }

        const batch =
          (item.batches ?? []).find((b) => !b.deletedAt && Number(b.quantity) > 0) ??
          (item.batches ?? []).find((b) => !b.deletedAt);

        await manager.query(
          `
          INSERT INTO claim_fulfillment_items (
            "id", "fulfillmentId", "claimItemId", "claimBatchId", "warehouseId",
            "productId", "productFlavourId", "uomId", "quantity",
            "settlementType", "creditAmount", "notes"
          ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
            $6::uuid, $7::uuid, $8::uuid, $9::int,
            $10::claim_fulfillment_items_settlementtype_enum, $11, $12
          )
          `,
          [
            randomUUID(),
            fulfillmentId,
            item.id,
            batch?.id ?? null,
            item.warehouseId,
            item.productId,
            item.productFlavourId,
            item.uomId,
            qty,
            line.settlementType ?? null,
            line.creditAmount != null ? String(line.creditAmount) : null,
            line.notes?.trim() || null,
          ],
        );

        await bumpClaimItemQty(manager, item.id, { qtyGiven: qty });
        await setClaimItemOutcome(
          manager,
          item.id,
          dto.type === ClaimFulfillmentType.DELIVER_TO_CUSTOMER
            ? ClaimItemUnitOutcome.DELIVERED
            : ClaimItemUnitOutcome.RETURNED_TO_STOCK,
        );
        consume.push({ item, quantity: qty });
      }

      await this.claimStockService.consumeClaimItems(manager, scoped, consume);
      await refreshClaimStatusFromBalances(manager, claim.id);
      return this.loadOrFail(manager, scoped, fulfillmentId);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scoped,
      action: 'CLAIM_FULFILLMENT_POSTED',
      description: `Claim fulfillment ${created.fulfillmentNumber} posted`,
      metadata: { fulfillmentId: created.id, claimId: created.claimId },
    });

    return { data: created };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: {
      page?: number;
      limit?: number;
      claimId?: string;
      type?: ClaimFulfillmentType;
    },
  ) {
    const scoped = assertBusinessId(businessId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const qb = tenantDb
      .getRepository(ClaimFulfillment)
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.claim', 'claim')
      .where('claim.businessId = :businessId', { businessId: scoped })
      .orderBy('f.fulfillmentDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.claimId) {
      qb.andWhere('f.claimId = :claimId', { claimId: query.claimId });
    }
    if (query.type) qb.andWhere('f.type = :type', { type: query.type });
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
      if (doc.status !== ClaimFulfillmentDocStatus.POSTED) {
        throw new BadRequestException(
          'Only POSTED fulfillments can be cancelled',
        );
      }
      const items = await manager.getRepository(ClaimFulfillmentItem).find({
        where: { fulfillmentId: doc.id },
      });
      for (const line of items) {
        await bumpClaimItemQty(manager, line.claimItemId, {
          qtyGiven: -roundQty(line.quantity),
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
        UPDATE claim_fulfillments
        SET "status" = $1::claim_fulfillments_status_enum,
            "cancelledAt" = CURRENT_TIMESTAMP,
            "cancelReason" = $2,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $3::uuid
        `,
        [
          ClaimFulfillmentDocStatus.CANCELLED,
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
      action: 'CLAIM_FULFILLMENT_CANCELLED',
      description: `Claim fulfillment ${cancelled.fulfillmentNumber} cancelled`,
      metadata: { fulfillmentId: cancelled.id },
    });

    return { data: cancelled };
  }
}
