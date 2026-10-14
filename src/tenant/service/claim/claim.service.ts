import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  Claim,
  ClaimDiscardType,
  ClaimItem,
  ClaimItemUnitOutcome,
  ClaimSourceType,
  ClaimStatus,
} from 'src/tenant-db/entities/claim.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { Product, ProductFlavour, Uom } from 'src/tenant-db/entities/product.entity';
import { Warehouse } from 'src/tenant-db/entities/warehouse.entity';
import { CreateClaimDto } from '../../dto/claim/create-claim.dto';
import { CreateClaimItemDto } from '../../dto/claim/create-claim-item.dto';
import { DiscardClaimDto } from '../../dto/claim/discard-claim.dto';
import { ReceiveFromVendorDto } from '../../dto/claim/receive-from-vendor.dto';
import { ClaimVendorItemDecision } from '../../dto/claim/receive-from-vendor-item.dto';
import { SendToVendorDto } from '../../dto/claim/send-to-vendor.dto';
import { UpdateClaimDto } from '../../dto/claim/update-claim.dto';
import { ValidateClaimDto } from '../../dto/claim/validate-claim.dto';
import { ActivityLogService } from '../activity-log.service';
import { ClaimStockService } from './claim-stock.service';

const CLAIM_NUMBER_PREFIX = 'CLM';

@Injectable()
export class ClaimService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly claimStockService: ClaimStockService,
  ) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private claimRelations() {
    return {
      party: true,
      warehouse: true,
      vendor: true,
      createdByUser: true,
      items: {
        product: true,
        productFlavour: { flavour: true },
        uom: true,
        warehouse: true,
        claimBatch: true,
      },
      batches: true,
    } as const;
  }

  private async generateClaimNumber(
    source: DataSource | EntityManager,
  ): Promise<string> {
    const last = await source
      .getRepository(Claim)
      .createQueryBuilder('claim')
      .where('claim.claimNumber LIKE :prefix', {
        prefix: `${CLAIM_NUMBER_PREFIX}-%`,
      })
      .orderBy('claim.claimNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.claimNumber.replace(`${CLAIM_NUMBER_PREFIX}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }
    return `${CLAIM_NUMBER_PREFIX}-${String(next).padStart(5, '0')}`;
  }

  private async assertWarehouse(
    manager: EntityManager,
    businessId: string,
    warehouseId: string,
  ) {
    const warehouse = await manager.getRepository(Warehouse).findOne({
      where: { id: warehouseId, businessId, deletedAt: IsNull() },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    return warehouse;
  }

  private async assertCustomer(
    manager: EntityManager,
    businessId: string,
    partyId: string,
  ) {
    const party = await manager.getRepository(Party).findOne({
      where: { id: partyId, businessId, deletedAt: IsNull() },
    });
    if (!party) {
      throw new NotFoundException('Customer party not found');
    }
    if (party.type === PartyType.VENDOR) {
      throw new BadRequestException('Party must be a customer (or BOTH)');
    }
    return party;
  }

  private async assertVendor(
    manager: EntityManager,
    businessId: string,
    vendorId: string,
  ) {
    const vendor = await manager.getRepository(Party).findOne({
      where: { id: vendorId, businessId, deletedAt: IsNull() },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (vendor.type === PartyType.CUSTOMER) {
      throw new BadRequestException('Party must be a vendor (or BOTH)');
    }
    return vendor;
  }

  private async validateLineMasters(
    manager: EntityManager,
    businessId: string,
    items: CreateClaimItemDto[],
  ) {
    for (const line of items) {
      const product = await manager.getRepository(Product).findOne({
        where: {
          id: line.productId,
          businessId,
          isDelete: false,
        },
      });
      if (!product) {
        throw new NotFoundException(`Product not found: ${line.productId}`);
      }

      const uom = await manager.getRepository(Uom).findOne({
        where: { id: line.uomId, businessId },
      });
      if (!uom) {
        throw new NotFoundException(`UOM not found: ${line.uomId}`);
      }

      await this.assertWarehouse(manager, businessId, line.warehouseId);

      if (line.productFlavourId != null) {
        const flavour = await manager.getRepository(ProductFlavour).findOne({
          where: {
            id: line.productFlavourId,
            productId: line.productId,
          } as { id: number; productId: string },
        });
        if (!flavour) {
          throw new NotFoundException(
            `Product flavour not found: ${line.productFlavourId}`,
          );
        }
      }
    }
  }

  private mapClaim(claim: Claim) {
    return claim;
  }

  private async loadClaimOrFail(
    manager: EntityManager | DataSource,
    businessId: string,
    id: string,
  ): Promise<Claim> {
    const claim = await manager.getRepository(Claim).findOne({
      where: { id, businessId },
      relations: this.claimRelations(),
    });
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }

  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    if (dto.sourceType === ClaimSourceType.CUSTOMER && !dto.partyId) {
      throw new BadRequestException('partyId is required for CUSTOMER claims');
    }
    if (dto.sourceType === ClaimSourceType.OWN_LOCATION && !dto.warehouseId) {
      throw new BadRequestException(
        'warehouseId is required for OWN_LOCATION claims',
      );
    }

    const created = await tenantDb.transaction(async (manager) => {
      if (dto.sourceType === ClaimSourceType.CUSTOMER) {
        await this.assertCustomer(manager, scopedBusinessId, dto.partyId!);
      } else {
        await this.assertWarehouse(manager, scopedBusinessId, dto.warehouseId!);
      }
      await this.validateLineMasters(manager, scopedBusinessId, dto.items);

      const claimNumber =
        dto.claimNumber?.trim() || (await this.generateClaimNumber(manager));
      const existing = await manager.getRepository(Claim).findOne({
        where: { claimNumber },
      });
      if (existing) {
        throw new ConflictException(
          `Claim number ${claimNumber} already exists`,
        );
      }

      const claimRepo = manager.getRepository(Claim);
      const claim = await claimRepo.save(
        claimRepo.create({
          businessId: scopedBusinessId,
          claimNumber,
          claimDate: new Date(dto.claimDate),
          sourceType: dto.sourceType,
          partyId:
            dto.sourceType === ClaimSourceType.CUSTOMER ? dto.partyId! : null,
          warehouseId:
            dto.sourceType === ClaimSourceType.OWN_LOCATION
              ? dto.warehouseId!
              : null,
          vendorId: null,
          status: ClaimStatus.DRAFT,
          isValid: null,
          invalidReason: null,
          notes: dto.notes?.trim() || null,
          createdBy: actorUserId,
          closedAt: null,
        }),
      );

      const itemRepo = manager.getRepository(ClaimItem);
      await itemRepo.save(
        dto.items.map((line) =>
          itemRepo.create({
            claimId: claim.id,
            productId: line.productId,
            productFlavourId: line.productFlavourId ?? null,
            uomId: line.uomId,
            warehouseId: line.warehouseId,
            claimBatchId: null,
            claimedQuantity: line.claimedQuantity,
            unitOutcome: ClaimItemUnitOutcome.PENDING,
            discardType: null,
            discardReason: null,
            notes: line.notes?.trim() || null,
          }),
        ),
      );

      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_CREATED',
      description: `Claim ${created.claimNumber} created`,
      metadata: { claimId: created.id, claimNumber: created.claimNumber },
    });

    return { data: this.mapClaim(created) };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: ClaimStatus;
      sourceType?: ClaimSourceType;
    },
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

    const qb = tenantDb
      .getRepository(Claim)
      .createQueryBuilder('claim')
      .leftJoinAndSelect('claim.party', 'party')
      .leftJoinAndSelect('claim.warehouse', 'warehouse')
      .leftJoinAndSelect('claim.vendor', 'vendor')
      .where('claim.businessId = :businessId', { businessId: scopedBusinessId })
      .orderBy('claim.claimDate', 'DESC')
      .addOrderBy('claim.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('claim.status = :status', { status: query.status });
    }
    if (query.sourceType) {
      qb.andWhere('claim.sourceType = :sourceType', {
        sourceType: query.sourceType,
      });
    }
    if (query.search?.trim()) {
      qb.andWhere('claim.claimNumber ILIKE :search', {
        search: `%${query.search.trim()}%`,
      });
    }

    const [rows, total] = await qb.getManyAndCount();

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_LISTED',
      description: 'Claims listed',
      metadata: { count: rows.length },
    });

    return {
      data: rows.map((row) => this.mapClaim(row)),
      meta: { total, page, limit },
    };
  }

  async view(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const claim = await this.loadClaimOrFail(
      tenantDb,
      scopedBusinessId,
      id,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VIEWED',
      description: `Claim ${claim.claimNumber} viewed`,
      metadata: { claimId: claim.id },
    });

    return { data: this.mapClaim(claim) };
  }

  async update(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: UpdateClaimDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.status !== ClaimStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT claims can be updated');
      }

      if (dto.claimDate) {
        claim.claimDate = new Date(dto.claimDate);
      }
      if (dto.notes !== undefined) {
        claim.notes = dto.notes?.trim() || null;
      }

      if (claim.sourceType === ClaimSourceType.CUSTOMER && dto.partyId) {
        await this.assertCustomer(manager, scopedBusinessId, dto.partyId);
        claim.partyId = dto.partyId;
      }
      if (
        claim.sourceType === ClaimSourceType.OWN_LOCATION &&
        dto.warehouseId
      ) {
        await this.assertWarehouse(manager, scopedBusinessId, dto.warehouseId);
        claim.warehouseId = dto.warehouseId;
      }

      if (dto.items?.length) {
        await this.validateLineMasters(manager, scopedBusinessId, dto.items);
        await manager.getRepository(ClaimItem).delete({ claimId: claim.id });
        const itemRepo = manager.getRepository(ClaimItem);
        await itemRepo.save(
          dto.items.map((line) =>
            itemRepo.create({
              claimId: claim.id,
              productId: line.productId,
              productFlavourId: line.productFlavourId ?? null,
              uomId: line.uomId,
              warehouseId: line.warehouseId,
              claimBatchId: null,
              claimedQuantity: line.claimedQuantity,
              unitOutcome: ClaimItemUnitOutcome.PENDING,
              discardType: null,
              discardReason: null,
              notes: line.notes?.trim() || null,
            }),
          ),
        );
      }

      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_UPDATED',
      description: `Claim ${updated.claimNumber} updated`,
      metadata: { claimId: updated.id },
    });

    return { data: this.mapClaim(updated) };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.status !== ClaimStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT claims can be deleted');
      }
      await manager.getRepository(ClaimItem).delete({ claimId: claim.id });
      await manager.getRepository(Claim).delete(claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_DELETED',
      description: `Claim ${id} deleted`,
      metadata: { claimId: id },
    });

    return { message: 'Claim deleted' };
  }

  /** DRAFT → SUBMITTED: create claim batches + increase claim stock */
  async submit(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.status !== ClaimStatus.DRAFT) {
        throw new BadRequestException('Only DRAFT claims can be submitted');
      }
      if (!claim.items?.length) {
        throw new BadRequestException('Claim must have items');
      }

      await this.claimStockService.intakeFromClaim(manager, claim, claim.items);
      claim.status = ClaimStatus.SUBMITTED;
      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_SUBMITTED',
      description: `Claim ${updated.claimNumber} submitted (claim stock intake)`,
      metadata: { claimId: updated.id },
    });

    return { data: this.mapClaim(updated) };
  }

  async validate(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: ValidateClaimDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (
        claim.status !== ClaimStatus.SUBMITTED &&
        claim.status !== ClaimStatus.DRAFT
      ) {
        throw new BadRequestException(
          'Only DRAFT or SUBMITTED claims can be validated',
        );
      }

      if (claim.status === ClaimStatus.DRAFT) {
        await this.claimStockService.intakeFromClaim(
          manager,
          claim,
          claim.items ?? [],
        );
      }

      claim.isValid = dto.isValid;

      if (!dto.isValid) {
        claim.invalidReason = dto.invalidReason?.trim() || 'Invalid claim';
        claim.status = ClaimStatus.INVALID_DISCARDED;
        await this.consumeAllItems(
          manager,
          scopedBusinessId,
          claim,
          ClaimItemUnitOutcome.DISCARDED,
          ClaimDiscardType.AS_IS,
          dto.discardReason || dto.invalidReason || 'Invalid claim',
        );
        claim.closedAt = new Date();
        claim.status = ClaimStatus.CLOSED;
      } else {
        claim.invalidReason = null;
        claim.status = ClaimStatus.VALIDATED;
      }

      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VALIDATED',
      description: `Claim ${updated.claimNumber} validated (isValid=${dto.isValid})`,
      metadata: { claimId: updated.id, isValid: dto.isValid },
    });

    return { data: this.mapClaim(updated) };
  }

  async sendToVendor(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: SendToVendorDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.status !== ClaimStatus.VALIDATED) {
        throw new BadRequestException(
          'Only VALIDATED claims can be sent to vendor',
        );
      }
      await this.assertVendor(manager, scopedBusinessId, dto.vendorId);
      claim.vendorId = dto.vendorId;
      claim.status = ClaimStatus.SENT_TO_VENDOR;
      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_SENT_TO_VENDOR',
      description: `Claim ${updated.claimNumber} sent to vendor`,
      metadata: { claimId: updated.id, vendorId: dto.vendorId },
    });

    return { data: this.mapClaim(updated) };
  }

  async receiveFromVendor(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: ReceiveFromVendorDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.status !== ClaimStatus.SENT_TO_VENDOR) {
        throw new BadRequestException(
          'Only SENT_TO_VENDOR claims can receive from vendor',
        );
      }

      const itemById = new Map((claim.items ?? []).map((row) => [row.id, row]));
      let accepted = 0;
      let rejected = 0;

      for (const line of dto.items) {
        const item = itemById.get(line.claimItemId);
        if (!item) {
          throw new BadRequestException(
            `Claim item ${line.claimItemId} not on this claim`,
          );
        }
        if (line.quantity > Number(item.claimedQuantity)) {
          throw new BadRequestException(
            `Receive qty exceeds claimed qty for item ${item.id}`,
          );
        }
        if (line.decision === ClaimVendorItemDecision.ACCEPTED) {
          item.unitOutcome = ClaimItemUnitOutcome.VENDOR_ACCEPTED;
          accepted += 1;
        } else {
          item.unitOutcome = ClaimItemUnitOutcome.VENDOR_REJECTED;
          rejected += 1;
        }
        await manager.getRepository(ClaimItem).save(item);
      }

      claim.status = ClaimStatus.RECEIVED_FROM_VENDOR;
      await manager.getRepository(Claim).save(claim);

      if (accepted > 0 && rejected === 0) {
        claim.status = ClaimStatus.VENDOR_ACCEPTED;
      } else if (accepted === 0 && rejected > 0) {
        claim.status = ClaimStatus.VENDOR_REJECTED_DISCARD;
      }
      await manager.getRepository(Claim).save(claim);

      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_RECEIVED_FROM_VENDOR',
      description: `Claim ${updated.claimNumber} received from vendor`,
      metadata: { claimId: updated.id },
    });

    return { data: this.mapClaim(updated) };
  }

  async discard(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: DiscardClaimDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      const allowed: ClaimStatus[] = [
        ClaimStatus.VENDOR_REJECTED_DISCARD,
        ClaimStatus.RECEIVED_FROM_VENDOR,
        ClaimStatus.INVALID_DISCARDED,
      ];
      if (!allowed.includes(claim.status) && claim.isValid !== false) {
        // allow discard when vendor rejected path or explicitly after receive with rejects
        if (claim.status !== ClaimStatus.VENDOR_REJECTED_DISCARD) {
          const hasReject = (claim.items ?? []).some(
            (item) =>
              item.unitOutcome === ClaimItemUnitOutcome.VENDOR_REJECTED,
          );
          if (!hasReject && claim.status !== ClaimStatus.INVALID_DISCARDED) {
            throw new BadRequestException(
              'Claim is not in a discardable state',
            );
          }
        }
      }

      const toConsume = (claim.items ?? []).filter(
        (item) =>
          item.unitOutcome === ClaimItemUnitOutcome.VENDOR_REJECTED ||
          item.unitOutcome === ClaimItemUnitOutcome.PENDING ||
          claim.status === ClaimStatus.VENDOR_REJECTED_DISCARD,
      );

      await this.claimStockService.consumeClaimItems(
        manager,
        scopedBusinessId,
        toConsume.map((item) => ({
          item,
          quantity: Number(item.claimedQuantity),
        })),
      );

      for (const item of toConsume) {
        item.unitOutcome = ClaimItemUnitOutcome.DISCARDED;
        item.discardType = dto.discardType;
        item.discardReason = dto.reason;
        await manager.getRepository(ClaimItem).save(item);
      }

      claim.status = ClaimStatus.CLOSED;
      claim.closedAt = new Date();
      if (dto.notes) {
        claim.notes = [claim.notes, dto.notes].filter(Boolean).join('\n');
      }
      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_DISCARDED',
      description: `Claim ${updated.claimNumber} discarded`,
      metadata: { claimId: updated.id, discardType: dto.discardType },
    });

    return { data: this.mapClaim(updated) };
  }

  /** Vendor accepted → deliver to customer (CUSTOMER source) */
  async deliverToCustomer(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.sourceType !== ClaimSourceType.CUSTOMER) {
        throw new BadRequestException(
          'Only CUSTOMER claims can be delivered to customer',
        );
      }
      if (
        claim.status !== ClaimStatus.VENDOR_ACCEPTED &&
        claim.status !== ClaimStatus.RECEIVED_FROM_VENDOR
      ) {
        throw new BadRequestException(
          'Claim must be vendor-accepted before customer delivery',
        );
      }

      const accepted = (claim.items ?? []).filter(
        (item) =>
          item.unitOutcome === ClaimItemUnitOutcome.VENDOR_ACCEPTED ||
          item.unitOutcome === ClaimItemUnitOutcome.PENDING,
      );
      if (!accepted.length) {
        throw new BadRequestException('No accepted items to deliver');
      }

      await this.claimStockService.consumeClaimItems(
        manager,
        scopedBusinessId,
        accepted.map((item) => ({
          item,
          quantity: Number(item.claimedQuantity),
        })),
      );

      for (const item of accepted) {
        item.unitOutcome = ClaimItemUnitOutcome.DELIVERED;
        await manager.getRepository(ClaimItem).save(item);
      }

      claim.status = ClaimStatus.CLOSED;
      claim.closedAt = new Date();
      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_DELIVERED_TO_CUSTOMER',
      description: `Claim ${updated.claimNumber} delivered to customer`,
      metadata: { claimId: updated.id },
    });

    return { data: this.mapClaim(updated) };
  }

  /** Vendor accepted → return to own warehouse/showroom */
  async returnToLocation(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimOrFail(manager, scopedBusinessId, id);
      if (claim.sourceType !== ClaimSourceType.OWN_LOCATION) {
        throw new BadRequestException(
          'Only OWN_LOCATION claims can return to location',
        );
      }
      if (
        claim.status !== ClaimStatus.VENDOR_ACCEPTED &&
        claim.status !== ClaimStatus.RECEIVED_FROM_VENDOR
      ) {
        throw new BadRequestException(
          'Claim must be vendor-accepted before location return',
        );
      }

      const accepted = (claim.items ?? []).filter(
        (item) =>
          item.unitOutcome === ClaimItemUnitOutcome.VENDOR_ACCEPTED ||
          item.unitOutcome === ClaimItemUnitOutcome.PENDING,
      );
      if (!accepted.length) {
        throw new BadRequestException('No accepted items to return');
      }

      await this.claimStockService.consumeClaimItems(
        manager,
        scopedBusinessId,
        accepted.map((item) => ({
          item,
          quantity: Number(item.claimedQuantity),
        })),
      );

      for (const item of accepted) {
        item.unitOutcome = ClaimItemUnitOutcome.RETURNED_TO_STOCK;
        await manager.getRepository(ClaimItem).save(item);
      }

      claim.status = ClaimStatus.CLOSED;
      claim.closedAt = new Date();
      await manager.getRepository(Claim).save(claim);
      return this.loadClaimOrFail(manager, scopedBusinessId, claim.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_RETURNED_TO_LOCATION',
      description: `Claim ${updated.claimNumber} returned to location`,
      metadata: { claimId: updated.id },
    });

    return { data: this.mapClaim(updated) };
  }

  private async consumeAllItems(
    manager: EntityManager,
    businessId: string,
    claim: Claim,
    outcome: ClaimItemUnitOutcome,
    discardType: ClaimDiscardType,
    reason: string,
  ) {
    const items = claim.items ?? [];
    await this.claimStockService.consumeClaimItems(
      manager,
      businessId,
      items.map((item) => ({
        item,
        quantity: Number(item.claimedQuantity),
      })),
    );
    for (const item of items) {
      item.unitOutcome = outcome;
      item.discardType = discardType;
      item.discardReason = reason;
      await manager.getRepository(ClaimItem).save(item);
    }
  }
}
