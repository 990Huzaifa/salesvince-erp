import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ClaimItem,
  ClaimItemUnitOutcome,
  ClaimStatus,
} from 'src/tenant-db/entities/claim/claim.entity';

export type ClaimQtyBalances = {
  toSend: number;
  atVendor: number;
  readyToGive: number;
  inMyWarehouse: number;
  balanceToGive: number;
};

export function roundQty(n: number): number {
  return Math.round(Number(n) || 0);
}

export function balancesOf(item: ClaimItem): ClaimQtyBalances {
  const claimed = roundQty(item.claimedQuantity);
  const discarded = roundQty(item.qtyDiscarded);
  const sent = roundQty(item.qtySent);
  const received = roundQty(item.qtyReceived);
  const rejected = roundQty(item.qtyRejected);
  const given = roundQty(item.qtyGiven);

  const toSend = Math.max(0, claimed - discarded - sent);
  const atVendor = Math.max(0, sent - received - rejected);
  const readyToGive = Math.max(0, received - given);
  const inMyWarehouse = toSend + readyToGive;
  const balanceToGive = toSend + atVendor + readyToGive;

  return { toSend, atVendor, readyToGive, inMyWarehouse, balanceToGive };
}

export type QtyDelta = {
  qtyDiscarded?: number;
  qtySent?: number;
  qtyReceived?: number;
  qtyRejected?: number;
  qtyGiven?: number;
};

export async function bumpClaimItemQty(
  manager: EntityManager,
  claimItemId: string,
  delta: QtyDelta,
): Promise<ClaimItem> {
  const item = await manager.getRepository(ClaimItem).findOne({
    where: { id: claimItemId },
  });
  if (!item) {
    throw new BadRequestException(`Claim item ${claimItemId} not found`);
  }

  const next = {
    qtyDiscarded: roundQty(item.qtyDiscarded) + roundQty(delta.qtyDiscarded ?? 0),
    qtySent: roundQty(item.qtySent) + roundQty(delta.qtySent ?? 0),
    qtyReceived: roundQty(item.qtyReceived) + roundQty(delta.qtyReceived ?? 0),
    qtyRejected: roundQty(item.qtyRejected) + roundQty(delta.qtyRejected ?? 0),
    qtyGiven: roundQty(item.qtyGiven) + roundQty(delta.qtyGiven ?? 0),
  };

  for (const [key, value] of Object.entries(next)) {
    if (value < 0) {
      throw new BadRequestException(
        `Claim item ${claimItemId} qty ${key} cannot go negative`,
      );
    }
  }

  const claimed = roundQty(item.claimedQuantity);
  if (
    next.qtyDiscarded + next.qtySent > claimed ||
    next.qtyReceived + next.qtyRejected > next.qtySent ||
    next.qtyGiven > next.qtyReceived
  ) {
    throw new BadRequestException(
      `Claim item ${claimItemId} qty movement exceeds balances`,
    );
  }

  await manager.query(
    `
    UPDATE claim_items SET
      "qtyDiscarded" = $1::int,
      "qtySent" = $2::int,
      "qtyReceived" = $3::int,
      "qtyRejected" = $4::int,
      "qtyGiven" = $5::int,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $6::uuid
    `,
    [
      next.qtyDiscarded,
      next.qtySent,
      next.qtyReceived,
      next.qtyRejected,
      next.qtyGiven,
      claimItemId,
    ],
  );

  return {
    ...item,
    ...next,
  };
}

export async function setClaimItemOutcome(
  manager: EntityManager,
  claimItemId: string,
  unitOutcome: ClaimItemUnitOutcome,
  extra?: { discardType?: string | null; discardReason?: string | null },
) {
  await manager.query(
    `
    UPDATE claim_items
    SET "unitOutcome" = $1::claim_items_unitoutcome_enum,
        "discardType" = COALESCE($2::claim_items_discardtype_enum, "discardType"),
        "discardReason" = COALESCE($3, "discardReason"),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $4::uuid
    `,
    [
      unitOutcome,
      extra?.discardType ?? null,
      extra?.discardReason ?? null,
      claimItemId,
    ],
  );
}

/** Balance-driven claim header status (PDF-style), keeping CLOSED when done. */
export async function refreshClaimStatusFromBalances(
  manager: EntityManager,
  claimId: string,
): Promise<ClaimStatus> {
  // ClaimItem.claimId is @RelationId — not usable in find/where; filter via relation.
  const items = await manager
    .getRepository(ClaimItem)
    .createQueryBuilder('item')
    .where('item.claim = :claimId', { claimId })
    .getMany();
  if (!items.length) {
    return ClaimStatus.DRAFT;
  }

  let totalBalance = 0;
  let totalToSend = 0;
  let totalAtVendor = 0;
  let totalReady = 0;
  let totalClaimed = 0;
  let totalDiscardedOrRejected = 0;

  for (const item of items) {
    const b = balancesOf(item);
    totalBalance += b.balanceToGive;
    totalToSend += b.toSend;
    totalAtVendor += b.atVendor;
    totalReady += b.readyToGive;
    totalClaimed += roundQty(item.claimedQuantity);
    totalDiscardedOrRejected +=
      roundQty(item.qtyDiscarded) + roundQty(item.qtyRejected);
  }

  let next: ClaimStatus;
  if (totalBalance === 0) {
    next =
      totalDiscardedOrRejected >= totalClaimed && totalClaimed > 0
        ? ClaimStatus.CLOSED
        : ClaimStatus.CLOSED;
  } else if (totalReady > 0) {
    next = ClaimStatus.RECEIVED_FROM_VENDOR;
  } else if (totalAtVendor > 0 && totalToSend === 0) {
    next = ClaimStatus.SENT_TO_VENDOR;
  } else if (totalToSend > 0) {
    next = ClaimStatus.VALIDATED;
  } else {
    next = ClaimStatus.SENT_TO_VENDOR;
  }

  const closedAt = next === ClaimStatus.CLOSED ? new Date() : null;
  await manager.query(
    `
    UPDATE claims
    SET "status" = $1::claims_status_enum,
        "closedAt" = $2,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = $3::uuid
    `,
    [next, closedAt, claimId],
  );

  return next;
}

export function assertBusinessId(businessId?: string): string {
  if (!businessId) {
    throw new BadRequestException('Business context is required');
  }
  return businessId;
}

export async function generateDocNumber(
  manager: EntityManager,
  entity: Function,
  field: string,
  prefix: string,
  claimNumber: string,
): Promise<string> {
  const safe = claimNumber.replace(/[^a-zA-Z0-9-]/g, '');
  const base = `${prefix}-${safe}`;
  const last = await manager
    .getRepository(entity)
    .createQueryBuilder('d')
    .where(`d.${field} LIKE :pattern`, { pattern: `${base}-%` })
    .orderBy(`d.${field}`, 'DESC')
    .getOne();

  let next = 1;
  if (last) {
    const suffix = String((last as any)[field]).replace(`${base}-`, '');
    next = (parseInt(suffix, 10) || 0) + 1;
  }
  return `${base}-${String(next).padStart(4, '0')}`;
}
