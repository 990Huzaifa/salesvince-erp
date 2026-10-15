import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ClaimCostType } from 'src/tenant-db/entities/claim/claim-cost-types.entity';
import { ClaimDiscardReason } from 'src/tenant-db/entities/claim/claim-discard-reasons.entity';
import { ClaimSettings } from 'src/tenant-db/entities/claim/claim-settings.entity';
import { CreateClaimCostTypeDto } from '../../dto/claim/create-claim-cost-type.dto';
import { CreateClaimDiscardReasonDto } from '../../dto/claim/create-claim-discard-reason.dto';
import { UpdateClaimSettingsDto } from '../../dto/claim/update-claim-settings.dto';
import { assertBusinessId } from './claim-qty.helper';

@Injectable()
export class ClaimMasterService {
  // —— Discard reasons ——
  async listDiscardReasons(
    tenantDb: DataSource,
    businessId: string | undefined,
  ) {
    const scoped = assertBusinessId(businessId);
    const data = await tenantDb
      .getRepository(ClaimDiscardReason)
      .createQueryBuilder('r')
      .where('r.businessId = :businessId', { businessId: scoped })
      .orderBy('r.name', 'ASC')
      .getMany();
    return { data };
  }

  async createDiscardReason(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimDiscardReasonDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const saved = await tenantDb.getRepository(ClaimDiscardReason).save(
      tenantDb.getRepository(ClaimDiscardReason).create({
        business: { id: scoped } as any,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
      }),
    );
    return { data: saved };
  }

  async updateDiscardReason(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: CreateClaimDiscardReasonDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const repo = tenantDb.getRepository(ClaimDiscardReason);
    const row = await repo
      .createQueryBuilder('r')
      .where('r.id = :id', { id })
      .andWhere('r.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) throw new NotFoundException('Discard reason not found');
    row.name = dto.name.trim();
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    return { data: await repo.save(row) };
  }

  async deleteDiscardReason(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
  ) {
    const scoped = assertBusinessId(businessId);
    const repo = tenantDb.getRepository(ClaimDiscardReason);
    const row = await repo
      .createQueryBuilder('r')
      .where('r.id = :id', { id })
      .andWhere('r.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) throw new NotFoundException('Discard reason not found');
    await repo.delete({ id });
    return { message: 'Discard reason deleted' };
  }

  // —— Cost types ——
  async listCostTypes(tenantDb: DataSource, businessId: string | undefined) {
    const scoped = assertBusinessId(businessId);
    const data = await tenantDb
      .getRepository(ClaimCostType)
      .createQueryBuilder('c')
      .where('c.businessId = :businessId', { businessId: scoped })
      .orderBy('c.name', 'ASC')
      .getMany();
    return { data };
  }

  async createCostType(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimCostTypeDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const saved = await tenantDb.getRepository(ClaimCostType).save(
      tenantDb.getRepository(ClaimCostType).create({
        business: { id: scoped } as any,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
      }),
    );
    return { data: saved };
  }

  async updateCostType(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: CreateClaimCostTypeDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const repo = tenantDb.getRepository(ClaimCostType);
    const row = await repo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .andWhere('c.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) throw new NotFoundException('Cost type not found');
    row.name = dto.name.trim();
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    return { data: await repo.save(row) };
  }

  async deleteCostType(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
  ) {
    const scoped = assertBusinessId(businessId);
    const repo = tenantDb.getRepository(ClaimCostType);
    const row = await repo
      .createQueryBuilder('c')
      .where('c.id = :id', { id })
      .andWhere('c.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) throw new NotFoundException('Cost type not found');
    await repo.delete({ id });
    return { message: 'Cost type deleted' };
  }

  // —— Settings ——
  async getSettings(tenantDb: DataSource, businessId: string | undefined) {
    const scoped = assertBusinessId(businessId);
    const repo = tenantDb.getRepository(ClaimSettings);
    let row = await repo
      .createQueryBuilder('s')
      .where('s.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) {
      row = await repo.save(
        repo.create({
          business: { id: scoped } as any,
          stuckAtVendorDays: 15,
          waitingToGiveDays: 15,
          agingBandDays: [15, 30, 60],
        }),
      );
    }
    return { data: row };
  }

  async updateSettings(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: UpdateClaimSettingsDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const repo = tenantDb.getRepository(ClaimSettings);
    let row = await repo
      .createQueryBuilder('s')
      .where('s.businessId = :businessId', { businessId: scoped })
      .getOne();
    if (!row) {
      row = repo.create({
        business: { id: scoped } as any,
        stuckAtVendorDays: 15,
        waitingToGiveDays: 15,
        agingBandDays: [15, 30, 60],
      });
    }
    if (dto.stuckAtVendorDays != null) {
      row.stuckAtVendorDays = dto.stuckAtVendorDays;
    }
    if (dto.waitingToGiveDays != null) {
      row.waitingToGiveDays = dto.waitingToGiveDays;
    }
    if (dto.agingBandDays) row.agingBandDays = dto.agingBandDays;
    return { data: await repo.save(row) };
  }
}
