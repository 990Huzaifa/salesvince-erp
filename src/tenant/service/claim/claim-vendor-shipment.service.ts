import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Claim,
  ClaimBatch,
  ClaimItem,
  ClaimStatus,
} from 'src/tenant-db/entities/claim/claim.entity';
import {
  ClaimVendorShipment,
  ClaimVendorShipmentItem,
  ClaimVendorShipmentStatus,
} from 'src/tenant-db/entities/claim/claim-vendor-shipments.entity';
import { Party, PartyType } from 'src/tenant-db/entities/party.entity';
import { CreateClaimVendorShipmentDto } from '../../dto/claim/create-claim-vendor-shipment.dto';
import { CreateClaimVendorShipmentItemDto } from '../../dto/claim/create-claim-vendor-shipment-item.dto';
import { UpdateClaimVendorShipmentDto } from '../../dto/claim/update-claim-vendor-shipment.dto';
import { ActivityLogService } from '../activity-log.service';

const SHIPMENT_NUMBER_PREFIX = 'CVS';

type ResolvedShipmentLine = {
  claimItemId: string;
  claimBatchId: string;
  warehouseId: string;
  productId: string;
  productFlavourId: string | null;
  uomId: string;
  quantity: number;
  notes: string | null;
  proofImage: string | null;
};

@Injectable()
export class ClaimVendorShipmentService {
  constructor(private readonly activityLogService: ActivityLogService) {}

  private assertBusinessId(businessId?: string): string {
    if (!businessId) {
      throw new BadRequestException('Business context is required');
    }
    return businessId;
  }

  private async generateShipmentNumber(
    manager: EntityManager,
    claimNumber: string,
  ): Promise<string> {
    const safe = claimNumber.replace(/[^a-zA-Z0-9-]/g, '');
    const base = `${SHIPMENT_NUMBER_PREFIX}-${safe}`;
    const last = await manager
      .getRepository(ClaimVendorShipment)
      .createQueryBuilder('s')
      .where('s.shipmentNumber LIKE :pattern', { pattern: `${base}-%` })
      .orderBy('s.shipmentNumber', 'DESC')
      .getOne();

    let next = 1;
    if (last) {
      const suffix = last.shipmentNumber.replace(`${base}-`, '');
      next = (parseInt(suffix, 10) || 0) + 1;
    }
    return `${base}-${String(next).padStart(4, '0')}`;
  }

  private async assertVendor(
    manager: EntityManager,
    businessId: string,
    vendorId: string,
  ) {
    const vendor = await manager
      .getRepository(Party)
      .createQueryBuilder('party')
      .where('party.id = :vendorId', { vendorId })
      .andWhere('party.businessId = :businessId', { businessId })
      .andWhere('party.deletedAt IS NULL')
      .getOne();
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }
    if (vendor.type === PartyType.CUSTOMER) {
      throw new BadRequestException('Party must be a vendor (or BOTH)');
    }
    return vendor;
  }

  private async loadClaimForShipment(
    manager: EntityManager,
    businessId: string,
    claimId: string,
  ): Promise<Claim> {
    const claim = await manager
      .getRepository(Claim)
      .createQueryBuilder('claim')
      .leftJoinAndSelect('claim.items', 'items')
      .leftJoinAndSelect('items.batches', 'batches')
      .where('claim.id = :claimId', { claimId })
      .andWhere('claim.businessId = :businessId', { businessId })
      .getOne();
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    return claim;
  }

  private async loadShipmentOrFail(
    manager: EntityManager | DataSource,
    businessId: string,
    id: string,
  ): Promise<ClaimVendorShipment> {
    const shipment = await manager
      .getRepository(ClaimVendorShipment)
      .createQueryBuilder('shipment')
      .leftJoinAndSelect('shipment.claim', 'claim')
      .leftJoinAndSelect('shipment.vendor', 'vendor')
      .leftJoinAndSelect('shipment.items', 'items')
      .leftJoinAndSelect('items.claimItem', 'claimItem')
      .leftJoinAndSelect('items.claimBatch', 'claimBatch')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('items.productFlavour', 'productFlavour')
      .leftJoinAndSelect('productFlavour.flavour', 'flavour')
      .leftJoinAndSelect('items.uom', 'uom')
      .leftJoinAndSelect('items.warehouse', 'warehouse')
      .where('shipment.id = :id', { id })
      .andWhere('claim.businessId = :businessId', { businessId })
      .getOne();
    if (!shipment) {
      throw new NotFoundException('Claim vendor shipment not found');
    }
    return shipment;
  }

  private resolveBatchForItem(item: ClaimItem): ClaimBatch {
    const batch =
      (item.batches ?? []).find((b) => !b.deletedAt && Number(b.quantity) > 0) ??
      (item.batches ?? []).find((b) => !b.deletedAt);
    if (!batch) {
      throw new BadRequestException(
        `Claim item ${item.id} has no claim batch — submit claim first`,
      );
    }
    return batch;
  }

  private async alreadyShippedQty(
    manager: EntityManager,
    claimItemId: string,
    excludeShipmentId?: string,
  ): Promise<number> {
    const qb = manager
      .getRepository(ClaimVendorShipmentItem)
      .createQueryBuilder('si')
      .innerJoin('si.shipment', 's')
      .select('COALESCE(SUM(si.quantity), 0)', 'total')
      .where('si.claimItemId = :claimItemId', { claimItemId })
      .andWhere('s.shipmentStatus != :cancelled', {
        cancelled: ClaimVendorShipmentStatus.CANCELLED,
      });
    if (excludeShipmentId) {
      qb.andWhere('s.id != :excludeShipmentId', { excludeShipmentId });
    }
    const raw = await qb.getRawOne<{ total: string }>();
    return Math.round(Number(raw?.total ?? 0));
  }

  private async resolveLines(
    manager: EntityManager,
    claim: Claim,
    itemsDto?: CreateClaimVendorShipmentItemDto[],
    excludeShipmentId?: string,
  ): Promise<ResolvedShipmentLine[]> {
    const claimItems = claim.items ?? [];
    if (!claimItems.length) {
      throw new BadRequestException('Claim has no items to ship');
    }

    const byId = new Map(claimItems.map((row) => [row.id, row]));
    const source: CreateClaimVendorShipmentItemDto[] =
      itemsDto?.length
        ? itemsDto
        : claimItems.map((row) => ({ claimItemId: row.id }));

    const lines: ResolvedShipmentLine[] = [];

    for (const line of source) {
      const claimItem = byId.get(line.claimItemId);
      if (!claimItem) {
        throw new BadRequestException(
          `Claim item ${line.claimItemId} not on this claim`,
        );
      }

      const batch = this.resolveBatchForItem(claimItem);
      const remainingBatch = Math.round(Number(batch.quantity));
      const already = await this.alreadyShippedQty(
        manager,
        claimItem.id,
        excludeShipmentId,
      );
      const maxShip = Math.max(
        0,
        Math.min(remainingBatch, Number(claimItem.claimedQuantity) - already),
      );
      const qty = line.quantity != null ? Math.round(line.quantity) : maxShip;

      if (qty <= 0) {
        throw new BadRequestException(
          `No remaining qty to ship for claim item ${claimItem.id}`,
        );
      }
      if (qty > maxShip) {
        throw new BadRequestException(
          `Ship qty ${qty} exceeds remaining ${maxShip} for claim item ${claimItem.id}`,
        );
      }

      lines.push({
        claimItemId: claimItem.id,
        claimBatchId: batch.id,
        warehouseId: claimItem.warehouseId,
        productId: claimItem.productId,
        productFlavourId:
          claimItem.productFlavourId != null
            ? String(claimItem.productFlavourId)
            : null,
        uomId: claimItem.uomId,
        quantity: qty,
        notes: line.notes?.trim() || null,
        proofImage: line.proofImage?.trim() || null,
      });
    }

    return lines;
  }

  private async insertShipment(
    manager: EntityManager,
    params: {
      shipmentNumber: string;
      shipmentDate: Date;
      claimId: string;
      vendorId: string;
      status: ClaimVendorShipmentStatus;
      notes: string | null;
      proofImage: string | null;
      lines: ResolvedShipmentLine[];
    },
  ): Promise<string> {
    const shipmentId = randomUUID();
    await manager.query(
      `
      INSERT INTO claim_vendor_shipments (
        "id", "shipmentNumber", "shipmentDate", "claimId", "vendorId",
        "shipmentStatus", "notes", "proofImage"
      ) VALUES (
        $1::uuid, $2, $3::date, $4::uuid, $5::uuid,
        $6::claim_vendor_shipments_shipmentstatus_enum, $7, $8
      )
      `,
      [
        shipmentId,
        params.shipmentNumber,
        params.shipmentDate,
        params.claimId,
        params.vendorId,
        params.status,
        params.notes,
        params.proofImage,
      ],
    );

    for (const line of params.lines) {
      await manager.query(
        `
        INSERT INTO claim_vendor_shipment_items (
          "id", "shipmentId", "claimItemId", "claimBatchId", "warehouseId",
          "productId", "productFlavourId", "uomId", "quantity", "notes", "proofImage"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6::uuid, $7::uuid, $8::uuid, $9::int, $10, $11
        )
        `,
        [
          randomUUID(),
          shipmentId,
          line.claimItemId,
          line.claimBatchId,
          line.warehouseId,
          line.productId,
          line.productFlavourId,
          line.uomId,
          line.quantity,
          line.notes,
          line.proofImage,
        ],
      );
    }

    return shipmentId;
  }

  private async replaceShipmentItems(
    manager: EntityManager,
    shipmentId: string,
    lines: ResolvedShipmentLine[],
  ) {
    await manager.query(
      `DELETE FROM claim_vendor_shipment_items WHERE "shipmentId" = $1::uuid`,
      [shipmentId],
    );
    for (const line of lines) {
      await manager.query(
        `
        INSERT INTO claim_vendor_shipment_items (
          "id", "shipmentId", "claimItemId", "claimBatchId", "warehouseId",
          "productId", "productFlavourId", "uomId", "quantity", "notes", "proofImage"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6::uuid, $7::uuid, $8::uuid, $9::int, $10, $11
        )
        `,
        [
          randomUUID(),
          shipmentId,
          line.claimItemId,
          line.claimBatchId,
          line.warehouseId,
          line.productId,
          line.productFlavourId,
          line.uomId,
          line.quantity,
          line.notes,
          line.proofImage,
        ],
      );
    }
  }

  /** Create PENDING shipment (does not change claim status). */
  async create(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimVendorShipmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const created = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimForShipment(
        manager,
        scopedBusinessId,
        dto.claimId,
      );
      if (
        claim.status !== ClaimStatus.VALIDATED &&
        claim.status !== ClaimStatus.SENT_TO_VENDOR
      ) {
        throw new BadRequestException(
          'Only VALIDATED or SENT_TO_VENDOR claims can create vendor shipments',
        );
      }

      await this.assertVendor(manager, scopedBusinessId, dto.vendorId);
      const lines = await this.resolveLines(manager, claim, dto.items);
      const shipmentNumber = await this.generateShipmentNumber(
        manager,
        claim.claimNumber,
      );

      const shipmentId = await this.insertShipment(manager, {
        shipmentNumber,
        shipmentDate: new Date(dto.shipmentDate || claim.claimDate),
        claimId: claim.id,
        vendorId: dto.vendorId,
        status: ClaimVendorShipmentStatus.PENDING,
        notes: dto.notes?.trim() || null,
        proofImage: dto.proofImage?.trim() || null,
        lines,
      });

      return this.loadShipmentOrFail(manager, scopedBusinessId, shipmentId);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_CREATED',
      description: `Claim vendor shipment ${created.shipmentNumber} created`,
      metadata: {
        shipmentId: created.id,
        claimId: created.claimId,
        vendorId: created.vendorId,
      },
    });

    return { data: created };
  }

  /**
   * Create shipment as SHIPPED and mark claim SENT_TO_VENDOR.
   * Used by POST /tenant/claims/send-to-vendor/:id
   */
  async createAndShip(
    tenantDb: DataSource,
    businessId: string | undefined,
    dto: CreateClaimVendorShipmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const result = await tenantDb.transaction(async (manager) => {
      const claim = await this.loadClaimForShipment(
        manager,
        scopedBusinessId,
        dto.claimId,
      );
      if (claim.status !== ClaimStatus.VALIDATED) {
        throw new BadRequestException(
          'Only VALIDATED claims can be sent to vendor',
        );
      }

      await this.assertVendor(manager, scopedBusinessId, dto.vendorId);
      const lines = await this.resolveLines(manager, claim, dto.items);
      const shipmentNumber = await this.generateShipmentNumber(
        manager,
        claim.claimNumber,
      );

      const shipmentId = await this.insertShipment(manager, {
        shipmentNumber,
        shipmentDate: new Date(dto.shipmentDate || new Date()),
        claimId: claim.id,
        vendorId: dto.vendorId,
        status: ClaimVendorShipmentStatus.SHIPPED,
        notes: dto.notes?.trim() || null,
        proofImage: dto.proofImage?.trim() || null,
        lines,
      });

      await manager.query(
        `
        UPDATE claims
        SET "vendorId" = $1::uuid,
            "status" = $2::claims_status_enum,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $3::uuid
        `,
        [dto.vendorId, ClaimStatus.SENT_TO_VENDOR, claim.id],
      );

      const shipment = await this.loadShipmentOrFail(
        manager,
        scopedBusinessId,
        shipmentId,
      );
      return shipment;
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_SHIPPED',
      description: `Claim vendor shipment ${result.shipmentNumber} shipped`,
      metadata: {
        shipmentId: result.id,
        claimId: result.claimId,
        vendorId: result.vendorId,
      },
    });

    return { data: result };
  }

  async list(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: {
      page?: number;
      limit?: number;
      claimId?: string;
      vendorId?: string;
      status?: ClaimVendorShipmentStatus;
      search?: string;
    },
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const qb = tenantDb
      .getRepository(ClaimVendorShipment)
      .createQueryBuilder('shipment')
      .leftJoinAndSelect('shipment.claim', 'claim')
      .leftJoinAndSelect('shipment.vendor', 'vendor')
      .where('claim.businessId = :businessId', { businessId: scopedBusinessId })
      .orderBy('shipment.shipmentDate', 'DESC')
      .addOrderBy('shipment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.claimId) {
      qb.andWhere('shipment.claimId = :claimId', { claimId: query.claimId });
    }
    if (query.vendorId) {
      qb.andWhere('shipment.vendorId = :vendorId', { vendorId: query.vendorId });
    }
    if (query.status) {
      qb.andWhere('shipment.shipmentStatus = :status', {
        status: query.status,
      });
    }
    if (query.search?.trim()) {
      qb.andWhere(
        '(shipment.shipmentNumber ILIKE :search OR claim.claimNumber ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows,
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
    const shipment = await this.loadShipmentOrFail(
      tenantDb,
      scopedBusinessId,
      id,
    );

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_VIEWED',
      description: `Claim vendor shipment ${shipment.shipmentNumber} viewed`,
      metadata: { shipmentId: shipment.id },
    });

    return { data: shipment };
  }

  async update(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    dto: UpdateClaimVendorShipmentDto,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const updated = await tenantDb.transaction(async (manager) => {
      const shipment = await this.loadShipmentOrFail(
        manager,
        scopedBusinessId,
        id,
      );
      if (shipment.shipmentStatus !== ClaimVendorShipmentStatus.PENDING) {
        throw new BadRequestException('Only PENDING shipments can be updated');
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (column: string, value: unknown) => {
        params.push(value);
        sets.push(`"${column}" = $${params.length}`);
      };

      if (dto.shipmentDate) add('shipmentDate', new Date(dto.shipmentDate));
      if (dto.notes !== undefined) add('notes', dto.notes?.trim() || null);
      if (dto.proofImage !== undefined) {
        add('proofImage', dto.proofImage?.trim() || null);
      }

      if (sets.length) {
        params.push(shipment.id);
        await manager.query(
          `UPDATE claim_vendor_shipments SET ${sets.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $${params.length}::uuid`,
          params,
        );
      }

      if (dto.items?.length) {
        const claim = await this.loadClaimForShipment(
          manager,
          scopedBusinessId,
          shipment.claimId,
        );
        const lines = await this.resolveLines(
          manager,
          claim,
          dto.items,
          shipment.id,
        );
        await this.replaceShipmentItems(manager, shipment.id, lines);
      }

      return this.loadShipmentOrFail(manager, scopedBusinessId, shipment.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_UPDATED',
      description: `Claim vendor shipment ${updated.shipmentNumber} updated`,
      metadata: { shipmentId: updated.id },
    });

    return { data: updated };
  }

  /** PENDING → SHIPPED; claim → SENT_TO_VENDOR */
  async ship(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const shipped = await tenantDb.transaction(async (manager) => {
      const shipment = await this.loadShipmentOrFail(
        manager,
        scopedBusinessId,
        id,
      );
      if (shipment.shipmentStatus !== ClaimVendorShipmentStatus.PENDING) {
        throw new BadRequestException('Only PENDING shipments can be shipped');
      }

      const claim = await this.loadClaimForShipment(
        manager,
        scopedBusinessId,
        shipment.claimId,
      );
      if (
        claim.status !== ClaimStatus.VALIDATED &&
        claim.status !== ClaimStatus.SENT_TO_VENDOR
      ) {
        throw new BadRequestException(
          'Claim must be VALIDATED (or already SENT_TO_VENDOR) to ship',
        );
      }

      await manager.query(
        `
        UPDATE claim_vendor_shipments
        SET "shipmentStatus" = $1::claim_vendor_shipments_shipmentstatus_enum,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $2::uuid
        `,
        [ClaimVendorShipmentStatus.SHIPPED, shipment.id],
      );

      await manager.query(
        `
        UPDATE claims
        SET "vendorId" = $1::uuid,
            "status" = $2::claims_status_enum,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $3::uuid
        `,
        [shipment.vendorId, ClaimStatus.SENT_TO_VENDOR, shipment.claimId],
      );

      return this.loadShipmentOrFail(manager, scopedBusinessId, shipment.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_SHIPPED',
      description: `Claim vendor shipment ${shipped.shipmentNumber} shipped`,
      metadata: { shipmentId: shipped.id, claimId: shipped.claimId },
    });

    return { data: shipped };
  }

  async cancel(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    const cancelled = await tenantDb.transaction(async (manager) => {
      const shipment = await this.loadShipmentOrFail(
        manager,
        scopedBusinessId,
        id,
      );
      if (shipment.shipmentStatus !== ClaimVendorShipmentStatus.PENDING) {
        throw new BadRequestException(
          'Only PENDING shipments can be cancelled',
        );
      }

      await manager.query(
        `
        UPDATE claim_vendor_shipments
        SET "shipmentStatus" = $1::claim_vendor_shipments_shipmentstatus_enum,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = $2::uuid
        `,
        [ClaimVendorShipmentStatus.CANCELLED, shipment.id],
      );

      return this.loadShipmentOrFail(manager, scopedBusinessId, shipment.id);
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_CANCELLED',
      description: `Claim vendor shipment ${cancelled.shipmentNumber} cancelled`,
      metadata: { shipmentId: cancelled.id },
    });

    return { data: cancelled };
  }

  async delete(
    tenantDb: DataSource,
    businessId: string | undefined,
    id: string,
    actorUserId: string,
  ) {
    const scopedBusinessId = this.assertBusinessId(businessId);

    await tenantDb.transaction(async (manager) => {
      const shipment = await this.loadShipmentOrFail(
        manager,
        scopedBusinessId,
        id,
      );
      if (shipment.shipmentStatus !== ClaimVendorShipmentStatus.PENDING) {
        throw new BadRequestException('Only PENDING shipments can be deleted');
      }
      await manager.query(
        `DELETE FROM claim_vendor_shipment_items WHERE "shipmentId" = $1::uuid`,
        [shipment.id],
      );
      await manager.query(
        `DELETE FROM claim_vendor_shipments WHERE "id" = $1::uuid`,
        [shipment.id],
      );
    });

    await this.activityLogService.recordActivityLog(tenantDb, {
      actorId: actorUserId,
      businessId: scopedBusinessId,
      action: 'CLAIM_VENDOR_SHIPMENT_DELETED',
      description: `Claim vendor shipment ${id} deleted`,
      metadata: { shipmentId: id },
    });

    return { message: 'Claim vendor shipment deleted' };
  }
}
