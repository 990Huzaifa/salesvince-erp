import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ClaimSettings } from 'src/tenant-db/entities/claim/claim-settings.entity';
import { ClaimVendorShipmentStatus } from 'src/tenant-db/entities/claim/claim-vendor-shipments.entity';
import { ClaimVendorReceiptDocStatus } from 'src/tenant-db/entities/claim/claim-vendor-receipts.entity';
import { ClaimDiscardDocStatus } from 'src/tenant-db/entities/claim/claim-discards.entity';
import { ClaimFulfillmentDocStatus } from 'src/tenant-db/entities/claim/claim-fulfillments.entity';
import { ClaimReportBaseQueryDto } from '../../dto/claim/claim-report.query.dto';
import { assertBusinessId } from './claim-qty.helper';

type DateRange = { start?: string; end?: string };

@Injectable()
export class ClaimReportService {
  private pageMeta(page: number, limit: number, total: number) {
    return { total, page, limit };
  }

  private resolvePage(query: ClaimReportBaseQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    return { page, limit, offset: (page - 1) * limit };
  }

  private dateRange(query: ClaimReportBaseQueryDto): DateRange {
    if (query.startDate && query.endDate && query.startDate > query.endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }
    return { start: query.startDate, end: query.endDate };
  }

  private async loadSettings(tenantDb: DataSource, businessId: string) {
    const row = await tenantDb
      .getRepository(ClaimSettings)
      .createQueryBuilder('s')
      .where('s.business = :businessId', { businessId })
      .getOne();
    return {
      stuckAtVendorDays: row?.stuckAtVendorDays ?? 15,
      waitingToGiveDays: row?.waitingToGiveDays ?? 15,
      agingBandDays: Array.isArray(row?.agingBandDays)
        ? row!.agingBandDays
        : [15, 30, 60],
    };
  }

  /** Status-wise claim pipeline + optional open list. */
  async pipeline(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    const summary = await tenantDb.query(
      `
      SELECT c.status AS status, COUNT(*)::int AS count
      FROM claims c
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
        AND ($4::text IS NULL OR c."sourceType"::text = $4)
      GROUP BY c.status
      ORDER BY c.status
      `,
      [scoped, start ?? null, end ?? null, query.sourceType ?? null],
    );

    const rows = await tenantDb.query(
      `
      SELECT
        c.id AS "claimId",
        c."claimNumber",
        c."claimDate",
        c."sourceType",
        c.status,
        c."partyId",
        party.name AS "partyName",
        c."vendorId",
        vendor.name AS "vendorName",
        c."warehouseId",
        wh.name AS "warehouseName",
        c."closedAt",
        c."createdAt"
      FROM claims c
      LEFT JOIN parties party ON party.id = c."partyId"
      LEFT JOIN parties vendor ON vendor.id = c."vendorId"
      LEFT JOIN warehouses wh ON wh.id = c."warehouseId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
        AND ($4::text IS NULL OR c."sourceType"::text = $4)
        AND ($5::text IS NULL OR c.status::text = $5)
        AND (
          $6::text IS NULL
          OR c."claimNumber" ILIKE '%' || $6 || '%'
          OR party.name ILIKE '%' || $6 || '%'
        )
      ORDER BY c."claimDate" DESC, c."createdAt" DESC
      LIMIT $7 OFFSET $8
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.sourceType ?? null,
        query.status ?? null,
        query.search?.trim() || null,
        limit,
        offset,
      ],
    );

    const totalRow = await tenantDb.query(
      `
      SELECT COUNT(*)::int AS total
      FROM claims c
      LEFT JOIN parties party ON party.id = c."partyId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
        AND ($4::text IS NULL OR c."sourceType"::text = $4)
        AND ($5::text IS NULL OR c.status::text = $5)
        AND (
          $6::text IS NULL
          OR c."claimNumber" ILIKE '%' || $6 || '%'
          OR party.name ILIKE '%' || $6 || '%'
        )
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.sourceType ?? null,
        query.status ?? null,
        query.search?.trim() || null,
      ],
    );

    return {
      data: {
        summary,
        claims: rows,
      },
      meta: this.pageMeta(page, limit, Number(totalRow[0]?.total ?? 0)),
    };
  }

  /**
   * Open qty balances — To send / At vendor / Ready to give
   * (claim + optional product/warehouse rollup).
   */
  async balances(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    const rows = await tenantDb.query(
      `
      SELECT
        c.id AS "claimId",
        c."claimNumber",
        c."claimDate",
        c."sourceType",
        c.status,
        party.name AS "partyName",
        vendor.name AS "vendorName",
        ci.id AS "claimItemId",
        ci."productId",
        p.name AS "productName",
        ci."productFlavourId",
        f.name AS "flavourName",
        ci."uomId",
        u.name AS "uomName",
        ci."warehouseId",
        wh.name AS "warehouseName",
        ci."claimedQuantity"::int AS claimed,
        ci."qtyDiscarded"::int AS discarded,
        ci."qtySent"::int AS sent,
        ci."qtyReceived"::int AS received,
        ci."qtyRejected"::int AS rejected,
        ci."qtyGiven"::int AS given,
        GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")::int AS "toSend",
        GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")::int AS "atVendor",
        GREATEST(0, ci."qtyReceived" - ci."qtyGiven")::int AS "readyToGive",
        (
          GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")
          + GREATEST(0, ci."qtyReceived" - ci."qtyGiven")
        )::int AS "inMyWarehouse",
        (
          GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")
          + GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")
          + GREATEST(0, ci."qtyReceived" - ci."qtyGiven")
        )::int AS "balanceToGive"
      FROM claim_items ci
      INNER JOIN claims c ON c.id = ci."claimId"
      LEFT JOIN parties party ON party.id = c."partyId"
      LEFT JOIN parties vendor ON vendor.id = c."vendorId"
      LEFT JOIN products p ON p.id = ci."productId"
      LEFT JOIN product_flavours pf ON pf.id = ci."productFlavourId"
      LEFT JOIN flavours f ON f.id = pf."flavourId"
      LEFT JOIN uoms u ON u.id = ci."uomId"
      LEFT JOIN warehouses wh ON wh.id = ci."warehouseId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
        AND ($4::uuid IS NULL OR ci."warehouseId" = $4::uuid)
        AND ($5::uuid IS NULL OR c."vendorId" = $5::uuid)
        AND ($6::uuid IS NULL OR c."partyId" = $6::uuid)
        AND ($7::uuid IS NULL OR ci."productId" = $7::uuid)
        AND ($8::text IS NULL OR c."sourceType"::text = $8)
        AND ($9::text IS NULL OR c.status::text = $9)
        AND (
          GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")
          + GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")
          + GREATEST(0, ci."qtyReceived" - ci."qtyGiven")
        ) > 0
      ORDER BY c."claimDate" DESC, c."claimNumber", p.name
      LIMIT $10 OFFSET $11
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.warehouseId ?? null,
        query.vendorId ?? null,
        query.partyId ?? null,
        query.productId ?? null,
        query.sourceType ?? null,
        query.status ?? null,
        limit,
        offset,
      ],
    );

    const totals = await tenantDb.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")), 0)::int AS "toSend",
        COALESCE(SUM(GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")), 0)::int AS "atVendor",
        COALESCE(SUM(GREATEST(0, ci."qtyReceived" - ci."qtyGiven")), 0)::int AS "readyToGive",
        COALESCE(SUM(
          GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")
          + GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")
          + GREATEST(0, ci."qtyReceived" - ci."qtyGiven")
        ), 0)::int AS "balanceToGive"
      FROM claim_items ci
      INNER JOIN claims c ON c.id = ci."claimId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
        AND ($4::uuid IS NULL OR ci."warehouseId" = $4::uuid)
        AND ($5::uuid IS NULL OR c."vendorId" = $5::uuid)
        AND ($6::uuid IS NULL OR c."partyId" = $6::uuid)
        AND ($7::uuid IS NULL OR ci."productId" = $7::uuid)
        AND ($8::text IS NULL OR c."sourceType"::text = $8)
        AND ($9::text IS NULL OR c.status::text = $9)
        AND (
          GREATEST(0, ci."claimedQuantity" - ci."qtyDiscarded" - ci."qtySent")
          + GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")
          + GREATEST(0, ci."qtyReceived" - ci."qtyGiven")
        ) > 0
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.warehouseId ?? null,
        query.vendorId ?? null,
        query.partyId ?? null,
        query.productId ?? null,
        query.sourceType ?? null,
        query.status ?? null,
      ],
    );

    return {
      data: {
        totals: totals[0] ?? {
          total: 0,
          toSend: 0,
          atVendor: 0,
          readyToGive: 0,
          balanceToGive: 0,
        },
        rows,
      },
      meta: this.pageMeta(page, limit, Number(totals[0]?.total ?? 0)),
    };
  }

  /** Stuck-at-vendor + waiting-to-give aging (uses claim_settings). */
  async aging(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const settings = await this.loadSettings(tenantDb, scoped);
    const bands = [...settings.agingBandDays].sort((a, b) => a - b);
    const { page, limit, offset } = this.resolvePage(query);

    const atVendor = await tenantDb.query(
      `
      SELECT
        c.id AS "claimId",
        c."claimNumber",
        c.status,
        vendor.id AS "vendorId",
        vendor.name AS "vendorName",
        COALESCE(SUM(GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")), 0)::int AS "atVendorQty",
        (
          SELECT MAX(s."shipmentDate")
          FROM claim_vendor_shipments s
          WHERE s."claimId" = c.id
            AND s."shipmentStatus" = 'SHIPPED'
        ) AS "lastShipDate",
        CURRENT_DATE - COALESCE(
          (
            SELECT MAX(s."shipmentDate")
            FROM claim_vendor_shipments s
            WHERE s."claimId" = c.id
              AND s."shipmentStatus" = 'SHIPPED'
          ),
          c."claimDate"
        ) AS "ageDays"
      FROM claims c
      INNER JOIN claim_items ci ON ci."claimId" = c.id
      LEFT JOIN parties vendor ON vendor.id = c."vendorId"
      WHERE c."businessId" = $1::uuid
        AND c.status NOT IN ('DRAFT', 'CLOSED')
      GROUP BY c.id, vendor.id, vendor.name
      HAVING SUM(GREATEST(0, ci."qtySent" - ci."qtyReceived" - ci."qtyRejected")) > 0
        AND (
          CURRENT_DATE - COALESCE(
            (
              SELECT MAX(s."shipmentDate")
              FROM claim_vendor_shipments s
              WHERE s."claimId" = c.id
                AND s."shipmentStatus" = 'SHIPPED'
            ),
            c."claimDate"
          )
        ) >= $2::int
      ORDER BY "ageDays" DESC
      LIMIT $3 OFFSET $4
      `,
      [scoped, settings.stuckAtVendorDays, limit, offset],
    );

    const waitingToGive = await tenantDb.query(
      `
      SELECT
        c.id AS "claimId",
        c."claimNumber",
        c.status,
        c."sourceType",
        party.name AS "partyName",
        COALESCE(SUM(GREATEST(0, ci."qtyReceived" - ci."qtyGiven")), 0)::int AS "readyToGiveQty",
        (
          SELECT MAX(r."receiptDate")
          FROM claim_vendor_receipts r
          WHERE r."claimId" = c.id
            AND r.status = 'POSTED'
        ) AS "lastReceiptDate",
        CURRENT_DATE - COALESCE(
          (
            SELECT MAX(r."receiptDate")
            FROM claim_vendor_receipts r
            WHERE r."claimId" = c.id
              AND r.status = 'POSTED'
          ),
          c."claimDate"
        ) AS "ageDays"
      FROM claims c
      INNER JOIN claim_items ci ON ci."claimId" = c.id
      LEFT JOIN parties party ON party.id = c."partyId"
      WHERE c."businessId" = $1::uuid
        AND c.status NOT IN ('DRAFT', 'CLOSED')
      GROUP BY c.id, party.name
      HAVING SUM(GREATEST(0, ci."qtyReceived" - ci."qtyGiven")) > 0
        AND (
          CURRENT_DATE - COALESCE(
            (
              SELECT MAX(r."receiptDate")
              FROM claim_vendor_receipts r
              WHERE r."claimId" = c.id
                AND r.status = 'POSTED'
            ),
            c."claimDate"
          )
        ) >= $2::int
      ORDER BY "ageDays" DESC
      LIMIT $3 OFFSET $4
      `,
      [scoped, settings.waitingToGiveDays, limit, offset],
    );

    const bandBuckets = bands.map((edge, i) => ({
      from: i === 0 ? 0 : bands[i - 1] + 1,
      to: edge,
      label: i === 0 ? `0-${edge}` : `${bands[i - 1] + 1}-${edge}`,
    }));
    bandBuckets.push({
      from: (bands[bands.length - 1] ?? 60) + 1,
      to: null as any,
      label: `${(bands[bands.length - 1] ?? 60) + 1}+`,
    });

    return {
      data: {
        settings,
        stuckAtVendor: atVendor,
        waitingToGive,
        agingBands: bandBuckets,
      },
      meta: { page, limit },
    };
  }

  /** Vendor shipped / accepted / rejected performance. */
  async vendorPerformance(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    const rows = await tenantDb.query(
      `
      WITH shipped AS (
        SELECT
          s."vendorId",
          SUM(si.quantity)::int AS "shippedQty",
          COUNT(DISTINCT s.id)::int AS "shipmentCount"
        FROM claim_vendor_shipments s
        INNER JOIN claim_vendor_shipment_items si ON si."shipmentId" = s.id
        INNER JOIN claims c ON c.id = s."claimId"
        WHERE c."businessId" = $1::uuid
          AND s."shipmentStatus" = 'SHIPPED'
          AND ($2::date IS NULL OR s."shipmentDate" >= $2::date)
          AND ($3::date IS NULL OR s."shipmentDate" <= $3::date)
          AND ($4::uuid IS NULL OR s."vendorId" = $4::uuid)
        GROUP BY s."vendorId"
      ),
      received AS (
        SELECT
          r."vendorId",
          SUM(ri."acceptedQuantity")::int AS "acceptedQty",
          SUM(ri."rejectedQuantity")::int AS "rejectedQty",
          COUNT(DISTINCT r.id)::int AS "receiptCount"
        FROM claim_vendor_receipts r
        INNER JOIN claim_vendor_receipt_items ri ON ri."receiptId" = r.id
        INNER JOIN claims c ON c.id = r."claimId"
        WHERE c."businessId" = $1::uuid
          AND r.status = 'POSTED'
          AND ($2::date IS NULL OR r."receiptDate" >= $2::date)
          AND ($3::date IS NULL OR r."receiptDate" <= $3::date)
          AND ($4::uuid IS NULL OR r."vendorId" = $4::uuid)
        GROUP BY r."vendorId"
      )
      SELECT
        COALESCE(sh."vendorId", rc."vendorId") AS "vendorId",
        v.name AS "vendorName",
        v.code AS "vendorCode",
        COALESCE(sh."shippedQty", 0)::int AS "shippedQty",
        COALESCE(sh."shipmentCount", 0)::int AS "shipmentCount",
        COALESCE(rc."acceptedQty", 0)::int AS "acceptedQty",
        COALESCE(rc."rejectedQty", 0)::int AS "rejectedQty",
        COALESCE(rc."receiptCount", 0)::int AS "receiptCount",
        CASE
          WHEN COALESCE(rc."acceptedQty", 0) + COALESCE(rc."rejectedQty", 0) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(rc."rejectedQty", 0)::numeric
              / (COALESCE(rc."acceptedQty", 0) + COALESCE(rc."rejectedQty", 0))) * 100,
            2
          )
        END AS "rejectionRatePct"
      FROM shipped sh
      FULL OUTER JOIN received rc ON rc."vendorId" = sh."vendorId"
      LEFT JOIN parties v ON v.id = COALESCE(sh."vendorId", rc."vendorId")
      ORDER BY "shippedQty" DESC, "rejectionRatePct" DESC
      LIMIT $5 OFFSET $6
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.vendorId ?? null,
        limit,
        offset,
      ],
    );

    const rejectReasons = await tenantDb.query(
      `
      SELECT
        COALESCE(ri."rejectReason", 'Unspecified') AS reason,
        SUM(ri."rejectedQuantity")::int AS qty,
        COUNT(*)::int AS lines
      FROM claim_vendor_receipt_items ri
      INNER JOIN claim_vendor_receipts r ON r.id = ri."receiptId"
      INNER JOIN claims c ON c.id = r."claimId"
      WHERE c."businessId" = $1::uuid
        AND r.status = 'POSTED'
        AND ri."rejectedQuantity" > 0
        AND ($2::date IS NULL OR r."receiptDate" >= $2::date)
        AND ($3::date IS NULL OR r."receiptDate" <= $3::date)
        AND ($4::uuid IS NULL OR r."vendorId" = $4::uuid)
      GROUP BY COALESCE(ri."rejectReason", 'Unspecified')
      ORDER BY qty DESC
      LIMIT 50
      `,
      [scoped, start ?? null, end ?? null, query.vendorId ?? null],
    );

    return {
      data: { vendors: rows, rejectReasons },
      meta: this.pageMeta(page, limit, rows.length),
    };
  }

  /** Deliveries / returns + settlement types. */
  async customerSettlement(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    const rows = await tenantDb.query(
      `
      SELECT
        f.id AS "fulfillmentId",
        f."fulfillmentNumber",
        f."fulfillmentDate",
        f.type,
        f.status,
        c.id AS "claimId",
        c."claimNumber",
        c."sourceType",
        party.name AS "partyName",
        wh.name AS "warehouseName",
        fi."productId",
        p.name AS "productName",
        fi.quantity::int AS quantity,
        fi."settlementType",
        fi."creditAmount",
        fi.notes
      FROM claim_fulfillment_items fi
      INNER JOIN claim_fulfillments f ON f.id = fi."fulfillmentId"
      INNER JOIN claims c ON c.id = f."claimId"
      LEFT JOIN parties party ON party.id = f."partyId"
      LEFT JOIN warehouses wh ON wh.id = f."warehouseId"
      LEFT JOIN products p ON p.id = fi."productId"
      WHERE c."businessId" = $1::uuid
        AND f.status = 'POSTED'
        AND ($2::date IS NULL OR f."fulfillmentDate" >= $2::date)
        AND ($3::date IS NULL OR f."fulfillmentDate" <= $3::date)
        AND ($4::uuid IS NULL OR f."partyId" = $4::uuid)
        AND ($5::uuid IS NULL OR fi."productId" = $5::uuid)
        AND ($6::text IS NULL OR c."sourceType"::text = $6)
      ORDER BY f."fulfillmentDate" DESC, f."fulfillmentNumber"
      LIMIT $7 OFFSET $8
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.partyId ?? null,
        query.productId ?? null,
        query.sourceType ?? null,
        limit,
        offset,
      ],
    );

    const summary = await tenantDb.query(
      `
      SELECT
        f.type AS type,
        COALESCE(fi."settlementType"::text, 'NONE') AS "settlementType",
        SUM(fi.quantity)::int AS qty,
        COALESCE(SUM(fi."creditAmount"), 0)::numeric AS "creditAmount"
      FROM claim_fulfillment_items fi
      INNER JOIN claim_fulfillments f ON f.id = fi."fulfillmentId"
      INNER JOIN claims c ON c.id = f."claimId"
      WHERE c."businessId" = $1::uuid
        AND f.status = 'POSTED'
        AND ($2::date IS NULL OR f."fulfillmentDate" >= $2::date)
        AND ($3::date IS NULL OR f."fulfillmentDate" <= $3::date)
        AND ($4::uuid IS NULL OR f."partyId" = $4::uuid)
      GROUP BY f.type, COALESCE(fi."settlementType"::text, 'NONE')
      ORDER BY f.type, "settlementType"
      `,
      [scoped, start ?? null, end ?? null, query.partyId ?? null],
    );

    const totalRow = await tenantDb.query(
      `
      SELECT COUNT(*)::int AS total
      FROM claim_fulfillment_items fi
      INNER JOIN claim_fulfillments f ON f.id = fi."fulfillmentId"
      INNER JOIN claims c ON c.id = f."claimId"
      WHERE c."businessId" = $1::uuid
        AND f.status = 'POSTED'
        AND ($2::date IS NULL OR f."fulfillmentDate" >= $2::date)
        AND ($3::date IS NULL OR f."fulfillmentDate" <= $3::date)
        AND ($4::uuid IS NULL OR f."partyId" = $4::uuid)
        AND ($5::uuid IS NULL OR fi."productId" = $5::uuid)
        AND ($6::text IS NULL OR c."sourceType"::text = $6)
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.partyId ?? null,
        query.productId ?? null,
        query.sourceType ?? null,
      ],
    );

    return {
      data: { summary, rows },
      meta: this.pageMeta(page, limit, Number(totalRow[0]?.total ?? 0)),
    };
  }

  /** Discard / scrap loss by reason + action. */
  async discardLoss(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    const byReason = await tenantDb.query(
      `
      SELECT
        COALESCE(dr.name, di.reason, 'Unspecified') AS reason,
        di.action,
        SUM(di.quantity)::int AS qty,
        COUNT(*)::int AS lines
      FROM claim_discard_items di
      INNER JOIN claim_discards d ON d.id = di."discardId"
      INNER JOIN claims c ON c.id = d."claimId"
      LEFT JOIN claim_discard_reasons dr ON dr.id = di."discardReasonId"
      WHERE c."businessId" = $1::uuid
        AND d.status = 'POSTED'
        AND ($2::date IS NULL OR d."discardDate" >= $2::date)
        AND ($3::date IS NULL OR d."discardDate" <= $3::date)
        AND ($4::uuid IS NULL OR di."productId" = $4::uuid)
        AND ($5::uuid IS NULL OR di."warehouseId" = $5::uuid)
      GROUP BY COALESCE(dr.name, di.reason, 'Unspecified'), di.action
      ORDER BY qty DESC
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.productId ?? null,
        query.warehouseId ?? null,
      ],
    );

    const byProduct = await tenantDb.query(
      `
      SELECT
        di."productId",
        p.name AS "productName",
        di."uomId",
        u.name AS "uomName",
        SUM(di.quantity)::int AS qty,
        SUM(CASE WHEN di.action = 'SCRAP' THEN di.quantity ELSE 0 END)::int AS "scrapQty",
        SUM(CASE WHEN di.action = 'AS_IS' THEN di.quantity ELSE 0 END)::int AS "asIsQty"
      FROM claim_discard_items di
      INNER JOIN claim_discards d ON d.id = di."discardId"
      INNER JOIN claims c ON c.id = d."claimId"
      LEFT JOIN products p ON p.id = di."productId"
      LEFT JOIN uoms u ON u.id = di."uomId"
      WHERE c."businessId" = $1::uuid
        AND d.status = 'POSTED'
        AND ($2::date IS NULL OR d."discardDate" >= $2::date)
        AND ($3::date IS NULL OR d."discardDate" <= $3::date)
        AND ($4::uuid IS NULL OR di."productId" = $4::uuid)
        AND ($5::uuid IS NULL OR di."warehouseId" = $5::uuid)
      GROUP BY di."productId", p.name, di."uomId", u.name
      ORDER BY qty DESC
      LIMIT $6 OFFSET $7
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.productId ?? null,
        query.warehouseId ?? null,
        limit,
        offset,
      ],
    );

    const totals = await tenantDb.query(
      `
      SELECT
        COALESCE(SUM(di.quantity), 0)::int AS "totalQty",
        COALESCE(SUM(CASE WHEN di.action = 'SCRAP' THEN di.quantity ELSE 0 END), 0)::int AS "scrapQty",
        COALESCE(SUM(CASE WHEN di.action = 'AS_IS' THEN di.quantity ELSE 0 END), 0)::int AS "asIsQty"
      FROM claim_discard_items di
      INNER JOIN claim_discards d ON d.id = di."discardId"
      INNER JOIN claims c ON c.id = d."claimId"
      WHERE c."businessId" = $1::uuid
        AND d.status = 'POSTED'
        AND ($2::date IS NULL OR d."discardDate" >= $2::date)
        AND ($3::date IS NULL OR d."discardDate" <= $3::date)
      `,
      [scoped, start ?? null, end ?? null],
    );

    return {
      data: {
        totals: totals[0] ?? { totalQty: 0, scrapQty: 0, asIsQty: 0 },
        byReason,
        byProduct,
      },
      meta: this.pageMeta(page, limit, byProduct.length),
    };
  }

  /** Additional costs by type / borneBy / claim. */
  async additionalCosts(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    const byType = await tenantDb.query(
      `
      SELECT
        COALESCE(ct.name, 'Unspecified') AS "costType",
        ac."borneBy",
        ac."linkedDocType",
        COUNT(*)::int AS count,
        COALESCE(SUM(ac.amount), 0)::numeric AS amount
      FROM claim_additional_costs ac
      INNER JOIN claims c ON c.id = ac."claimId"
      LEFT JOIN claim_cost_types ct ON ct.id = ac."costTypeId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR ac."costDate" >= $2::date)
        AND ($3::date IS NULL OR ac."costDate" <= $3::date)
      GROUP BY COALESCE(ct.name, 'Unspecified'), ac."borneBy", ac."linkedDocType"
      ORDER BY amount DESC
      `,
      [scoped, start ?? null, end ?? null],
    );

    const byClaim = await tenantDb.query(
      `
      SELECT
        c.id AS "claimId",
        c."claimNumber",
        COUNT(ac.id)::int AS "costCount",
        COALESCE(SUM(ac.amount), 0)::numeric AS amount
      FROM claim_additional_costs ac
      INNER JOIN claims c ON c.id = ac."claimId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR ac."costDate" >= $2::date)
        AND ($3::date IS NULL OR ac."costDate" <= $3::date)
        AND ($4::text IS NULL OR c."claimNumber" ILIKE '%' || $4 || '%')
      GROUP BY c.id, c."claimNumber"
      ORDER BY amount DESC
      LIMIT $5 OFFSET $6
      `,
      [
        scoped,
        start ?? null,
        end ?? null,
        query.search?.trim() || null,
        limit,
        offset,
      ],
    );

    const totals = await tenantDb.query(
      `
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(ac.amount), 0)::numeric AS amount
      FROM claim_additional_costs ac
      INNER JOIN claims c ON c.id = ac."claimId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR ac."costDate" >= $2::date)
        AND ($3::date IS NULL OR ac."costDate" <= $3::date)
      `,
      [scoped, start ?? null, end ?? null],
    );

    return {
      data: {
        totals: totals[0] ?? { count: 0, amount: 0 },
        byType,
        byClaim,
      },
      meta: this.pageMeta(page, limit, byClaim.length),
    };
  }

  /** Period KPIs / throughput. */
  async kpi(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);

    const [created] = await tenantDb.query(
      `
      SELECT COUNT(*)::int AS count
      FROM claims c
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
      `,
      [scoped, start ?? null, end ?? null],
    );

    const [closed] = await tenantDb.query(
      `
      SELECT
        COUNT(*)::int AS count,
        ROUND(AVG(EXTRACT(EPOCH FROM (c."closedAt" - c."createdAt")) / 86400.0)::numeric, 2) AS "avgCycleDays"
      FROM claims c
      WHERE c."businessId" = $1::uuid
        AND c.status = 'CLOSED'
        AND c."closedAt" IS NOT NULL
        AND ($2::date IS NULL OR c."closedAt"::date >= $2::date)
        AND ($3::date IS NULL OR c."closedAt"::date <= $3::date)
      `,
      [scoped, start ?? null, end ?? null],
    );

    const [qty] = await tenantDb.query(
      `
      SELECT
        COALESCE(SUM(ci."claimedQuantity"), 0)::int AS claimed,
        COALESCE(SUM(ci."qtyDiscarded"), 0)::int AS discarded,
        COALESCE(SUM(ci."qtySent"), 0)::int AS sent,
        COALESCE(SUM(ci."qtyReceived"), 0)::int AS received,
        COALESCE(SUM(ci."qtyRejected"), 0)::int AS rejected,
        COALESCE(SUM(ci."qtyGiven"), 0)::int AS given
      FROM claim_items ci
      INNER JOIN claims c ON c.id = ci."claimId"
      WHERE c."businessId" = $1::uuid
        AND ($2::date IS NULL OR c."claimDate" >= $2::date)
        AND ($3::date IS NULL OR c."claimDate" <= $3::date)
      `,
      [scoped, start ?? null, end ?? null],
    );

    const claimed = Number(qty?.claimed ?? 0);
    const given = Number(qty?.given ?? 0);
    const sent = Number(qty?.sent ?? 0);
    const received = Number(qty?.received ?? 0);

    return {
      data: {
        claimsCreated: Number(created?.count ?? 0),
        claimsClosed: Number(closed?.count ?? 0),
        avgCycleDays: closed?.avgCycleDays != null ? Number(closed.avgCycleDays) : null,
        qty: {
          claimed,
          discarded: Number(qty?.discarded ?? 0),
          sent,
          received,
          rejected: Number(qty?.rejected ?? 0),
          given,
          giveRatePct: claimed ? Math.round((given / claimed) * 10000) / 100 : 0,
          receiveRatePct: sent ? Math.round((received / sent) * 10000) / 100 : 0,
        },
        openByStatus: await tenantDb.query(
          `
          SELECT status, COUNT(*)::int AS count
          FROM claims
          WHERE "businessId" = $1::uuid AND status != 'CLOSED'
          GROUP BY status
          ORDER BY status
          `,
          [scoped],
        ),
      },
    };
  }

  /** Document registers — shipments / receipts / discards / fulfillments. */
  async register(
    tenantDb: DataSource,
    businessId: string | undefined,
    docType: 'shipments' | 'receipts' | 'discards' | 'fulfillments',
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { start, end } = this.dateRange(query);
    const { page, limit, offset } = this.resolvePage(query);

    if (docType === 'shipments') {
      const rows = await tenantDb.query(
        `
        SELECT
          s.id, s."shipmentNumber", s."shipmentDate", s."shipmentStatus" AS status,
          c."claimNumber", v.name AS "vendorName",
          (SELECT COALESCE(SUM(si.quantity),0)::int FROM claim_vendor_shipment_items si WHERE si."shipmentId" = s.id) AS qty
        FROM claim_vendor_shipments s
        INNER JOIN claims c ON c.id = s."claimId"
        LEFT JOIN parties v ON v.id = s."vendorId"
        WHERE c."businessId" = $1::uuid
          AND ($2::date IS NULL OR s."shipmentDate" >= $2::date)
          AND ($3::date IS NULL OR s."shipmentDate" <= $3::date)
          AND ($4::uuid IS NULL OR s."vendorId" = $4::uuid)
          AND s."shipmentStatus" != $5
        ORDER BY s."shipmentDate" DESC
        LIMIT $6 OFFSET $7
        `,
        [
          scoped,
          start ?? null,
          end ?? null,
          query.vendorId ?? null,
          ClaimVendorShipmentStatus.CANCELLED,
          limit,
          offset,
        ],
      );
      return { data: rows, meta: this.pageMeta(page, limit, rows.length) };
    }

    if (docType === 'receipts') {
      const rows = await tenantDb.query(
        `
        SELECT
          r.id, r."receiptNumber", r."receiptDate", r.status,
          c."claimNumber", v.name AS "vendorName",
          (SELECT COALESCE(SUM(ri."acceptedQuantity"),0)::int FROM claim_vendor_receipt_items ri WHERE ri."receiptId" = r.id) AS "acceptedQty",
          (SELECT COALESCE(SUM(ri."rejectedQuantity"),0)::int FROM claim_vendor_receipt_items ri WHERE ri."receiptId" = r.id) AS "rejectedQty"
        FROM claim_vendor_receipts r
        INNER JOIN claims c ON c.id = r."claimId"
        LEFT JOIN parties v ON v.id = r."vendorId"
        WHERE c."businessId" = $1::uuid
          AND r.status = $2
          AND ($3::date IS NULL OR r."receiptDate" >= $3::date)
          AND ($4::date IS NULL OR r."receiptDate" <= $4::date)
          AND ($5::uuid IS NULL OR r."vendorId" = $5::uuid)
        ORDER BY r."receiptDate" DESC
        LIMIT $6 OFFSET $7
        `,
        [
          scoped,
          ClaimVendorReceiptDocStatus.POSTED,
          start ?? null,
          end ?? null,
          query.vendorId ?? null,
          limit,
          offset,
        ],
      );
      return { data: rows, meta: this.pageMeta(page, limit, rows.length) };
    }

    if (docType === 'discards') {
      const rows = await tenantDb.query(
        `
        SELECT
          d.id, d."discardNumber", d."discardDate", d.status,
          c."claimNumber",
          (SELECT COALESCE(SUM(di.quantity),0)::int FROM claim_discard_items di WHERE di."discardId" = d.id) AS qty
        FROM claim_discards d
        INNER JOIN claims c ON c.id = d."claimId"
        WHERE c."businessId" = $1::uuid
          AND d.status = $2
          AND ($3::date IS NULL OR d."discardDate" >= $3::date)
          AND ($4::date IS NULL OR d."discardDate" <= $4::date)
        ORDER BY d."discardDate" DESC
        LIMIT $5 OFFSET $6
        `,
        [
          scoped,
          ClaimDiscardDocStatus.POSTED,
          start ?? null,
          end ?? null,
          limit,
          offset,
        ],
      );
      return { data: rows, meta: this.pageMeta(page, limit, rows.length) };
    }

    const rows = await tenantDb.query(
      `
      SELECT
        f.id, f."fulfillmentNumber", f."fulfillmentDate", f.type, f.status,
        c."claimNumber", party.name AS "partyName",
        (SELECT COALESCE(SUM(fi.quantity),0)::int FROM claim_fulfillment_items fi WHERE fi."fulfillmentId" = f.id) AS qty
      FROM claim_fulfillments f
      INNER JOIN claims c ON c.id = f."claimId"
      LEFT JOIN parties party ON party.id = f."partyId"
      WHERE c."businessId" = $1::uuid
        AND f.status = $2
        AND ($3::date IS NULL OR f."fulfillmentDate" >= $3::date)
        AND ($4::date IS NULL OR f."fulfillmentDate" <= $4::date)
        AND ($5::uuid IS NULL OR f."partyId" = $5::uuid)
      ORDER BY f."fulfillmentDate" DESC
      LIMIT $6 OFFSET $7
      `,
      [
        scoped,
        ClaimFulfillmentDocStatus.POSTED,
        start ?? null,
        end ?? null,
        query.partyId ?? null,
        limit,
        offset,
      ],
    );
    return { data: rows, meta: this.pageMeta(page, limit, rows.length) };
  }

  /** Claim stock on-hand summary (claim inventory, not ERP stock). */
  async claimStockSummary(
    tenantDb: DataSource,
    businessId: string | undefined,
    query: ClaimReportBaseQueryDto,
  ) {
    const scoped = assertBusinessId(businessId);
    const { page, limit, offset } = this.resolvePage(query);

    const rows = await tenantDb.query(
      `
      SELECT
        cs."warehouseId",
        wh.name AS "warehouseName",
        cs."productId",
        p.name AS "productName",
        cs."productFlavourId",
        f.name AS "flavourName",
        cs."uomId",
        u.name AS "uomName",
        cs."quantityOnHand"::int AS "quantityOnHand"
      FROM claim_stocks cs
      LEFT JOIN warehouses wh ON wh.id = cs."warehouseId"
      LEFT JOIN products p ON p.id = cs."productId"
      LEFT JOIN product_flavours pf ON pf.id = cs."productFlavourId"
      LEFT JOIN flavours f ON f.id = pf."flavourId"
      LEFT JOIN uoms u ON u.id = cs."uomId"
      WHERE cs."businessId" = $1::uuid
        AND cs."deletedAt" IS NULL
        AND cs."quantityOnHand" > 0
        AND ($2::uuid IS NULL OR cs."warehouseId" = $2::uuid)
        AND ($3::uuid IS NULL OR cs."productId" = $3::uuid)
        AND ($4::text IS NULL OR p.name ILIKE '%' || $4 || '%')
      ORDER BY wh.name, p.name
      LIMIT $5 OFFSET $6
      `,
      [
        scoped,
        query.warehouseId ?? null,
        query.productId ?? null,
        query.search?.trim() || null,
        limit,
        offset,
      ],
    );

    const [totals] = await tenantDb.query(
      `
      SELECT
        COUNT(*)::int AS lines,
        COALESCE(SUM(cs."quantityOnHand"), 0)::int AS "quantityOnHand"
      FROM claim_stocks cs
      WHERE cs."businessId" = $1::uuid
        AND cs."deletedAt" IS NULL
        AND cs."quantityOnHand" > 0
        AND ($2::uuid IS NULL OR cs."warehouseId" = $2::uuid)
      `,
      [scoped, query.warehouseId ?? null],
    );

    return {
      data: { totals: totals ?? { lines: 0, quantityOnHand: 0 }, rows },
      meta: this.pageMeta(page, limit, Number(totals?.lines ?? 0)),
    };
  }
}
