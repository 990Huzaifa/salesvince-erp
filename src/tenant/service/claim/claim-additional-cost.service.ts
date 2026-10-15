import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Claim } from 'src/tenant-db/entities/claim/claim.entity';
import { ClaimAdditionalCost } from 'src/tenant-db/entities/claim/claim-additional-costs.entity';
import { ClaimCostType } from 'src/tenant-db/entities/claim/claim-cost-types.entity';
import { CreateClaimAdditionalCostDto } from '../../dto/claim/create-claim-additional-cost.dto';
import { ActivityLogService } from '../activity-log.service';
import { assertBusinessId, generateDocNumber } from './claim-qty.helper';

@Injectable()
export class ClaimAdditionalCostService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimAdditionalCostDto,
    actorUserId: string,
  ) {
    const scoped = assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const claim = await manager
        .getRepository(Claim)
        .findOne({ where: { id: dto.claimId, businessId: scoped } });
      if (!claim) throw new NotFoundException('Claim not found');

      if (dto.costTypeId) {
        const ct = await manager.getRepository(ClaimCostType).findOne({
          where: { id: dto.costTypeId, businessId: scoped },
        });
        if (!ct) throw new NotFoundException('Cost type not found');
      }

      const id = randomUUID();
      const costNumber = await generateDocNumber(
        manager,
        ClaimAdditionalCost,
        'costNumber',
        'CAC',
        claim.claimNumber,
      );

      await manager.query(
        `
        INSERT INTO claim_additional_costs (
          "id", "costNumber", "costDate", "claimId", "linkedDocType",
          "linkedDocId", "costTypeId", "amount", "borneBy", "notes", "createdBy"
        ) VALUES (
          $1::uuid, $2, $3::date, $4::uuid, $5::claim_additional_costs_linkeddoctype_enum,
          $6::uuid, $7::uuid, $8, $9::claim_additional_costs_borneby_enum, $10, $11::uuid
        )
        `,
        [
          id,
          costNumber,
          new Date(dto.costDate || new Date()),
          claim.id,
          dto.linkedDocType,
          dto.linkedDocId,
          dto.costTypeId ?? null,
          String(dto.amount),
          dto.borneBy,
          dto.notes?.trim() || null,
          actorUserId,
        ],
      );

      return manager.getRepository(ClaimAdditionalCost).findOne({
        where: { id },
        relations: ['costType', 'claim'],
      });
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scoped,
      action: 'CLAIM_ADDITIONAL_COST_CREATED',
      description: `Claim additional cost ${created?.costNumber} created`,
      metadata: { costId: created?.id, claimId: dto.claimId },
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
      .getRepository(ClaimAdditionalCost)
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.claim', 'claim')
      .leftJoinAndSelect('c.costType', 'costType')
      .where('claim.businessId = :businessId', { businessId: scoped })
      .orderBy('c.costDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.claimId) {
      qb.andWhere('c.claimId = :claimId', { claimId: query.claimId });
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
    const row = await tenantDb
      .getRepository(ClaimAdditionalCost)
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.claim', 'claim')
      .leftJoinAndSelect('c.costType', 'costType')
      .where('c.id = :id', { id })
      .andWhere('claim.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) throw new NotFoundException('Additional cost not found');
    return { data: row };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scoped = assertBusinessId(businessId);
    const row = await tenantDb
      .getRepository(ClaimAdditionalCost)
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.claim', 'claim')
      .where('c.id = :id', { id })
      .andWhere('claim.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) throw new NotFoundException('Additional cost not found');

    await tenantDb
      .getRepository(ClaimAdditionalCost)
      .delete({ id: row.id });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scoped,
      action: 'CLAIM_ADDITIONAL_COST_DELETED',
      description: `Claim additional cost ${row.costNumber} deleted`,
      metadata: { costId: id },
    });

    return { message: 'Additional cost deleted' };
  }
}
