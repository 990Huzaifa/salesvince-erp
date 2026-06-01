import { MigrationInterface, QueryRunner } from 'typeorm';

const ITEM_TABLES = [
  'sale_order_items',
  'delivery_note_items',
  'sale_invoice_items',
  'sale_return_items',
] as const;

export class AddWarehouseIdToSaleItemTables1780400000003
  implements MigrationInterface
{
  name = 'AddWarehouseIdToSaleItemTables1780400000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ITEM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "warehouseId" uuid`,
      );
    }

    await queryRunner.query(`
      UPDATE "sale_order_items" soi
      SET "warehouseId" = w."id"
      FROM "sale_orders" so
      INNER JOIN LATERAL (
        SELECT wh."id"
        FROM "warehouses" wh
        WHERE wh."businessId" = so."businessId"
          AND wh."deletedAt" IS NULL
        ORDER BY wh."createdAt" ASC
        LIMIT 1
      ) w ON TRUE
      WHERE soi."saleOrderId" = so."id"
        AND soi."warehouseId" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "delivery_note_items" dni
      SET "warehouseId" = soi."warehouseId"
      FROM "sale_order_items" soi
      WHERE dni."saleOrderItemId" = soi."id"
        AND dni."warehouseId" IS NULL
        AND soi."warehouseId" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "delivery_note_items" dni
      SET "warehouseId" = w."id"
      FROM "delivery_notes" dn
      INNER JOIN LATERAL (
        SELECT wh."id"
        FROM "warehouses" wh
        WHERE wh."businessId" = dn."businessId"
          AND wh."deletedAt" IS NULL
        ORDER BY wh."createdAt" ASC
        LIMIT 1
      ) w ON TRUE
      WHERE dni."deliveryNoteId" = dn."id"
        AND dni."warehouseId" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "sale_invoice_items" sii
      SET "warehouseId" = dni."warehouseId"
      FROM "sale_invoices" si
      INNER JOIN "delivery_note_items" dni
        ON dni."deliveryNoteId" = si."deliveryNoteId"
        AND dni."productId" = sii."productId"
        AND dni."uomId" = sii."uomId"
        AND COALESCE(dni."productFlavourId"::text, '') = COALESCE(sii."productFlavourId"::text, '')
      WHERE sii."saleInvoiceId" = si."id"
        AND sii."warehouseId" IS NULL
        AND dni."warehouseId" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "sale_invoice_items" sii
      SET "warehouseId" = w."id"
      FROM "sale_invoices" si
      INNER JOIN LATERAL (
        SELECT wh."id"
        FROM "warehouses" wh
        WHERE wh."businessId" = si."businessId"
          AND wh."deletedAt" IS NULL
        ORDER BY wh."createdAt" ASC
        LIMIT 1
      ) w ON TRUE
      WHERE sii."saleInvoiceId" = si."id"
        AND sii."warehouseId" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "sale_return_items" sri
      SET "warehouseId" = sii."warehouseId"
      FROM "sale_returns" sr
      INNER JOIN "sale_invoice_items" sii
        ON sii."saleInvoiceId" = sr."saleInvoiceId"
        AND sii."productId" = sri."productId"
        AND sii."uomId" = sri."uomId"
        AND COALESCE(sii."productFlavourId"::text, '') = COALESCE(sri."productFlavourId"::text, '')
      WHERE sri."saleReturnId" = sr."id"
        AND sri."warehouseId" IS NULL
        AND sii."warehouseId" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "sale_return_items" sri
      SET "warehouseId" = w."id"
      FROM "sale_returns" sr
      INNER JOIN LATERAL (
        SELECT wh."id"
        FROM "warehouses" wh
        WHERE wh."businessId" = sr."businessId"
          AND wh."deletedAt" IS NULL
        ORDER BY wh."createdAt" ASC
        LIMIT 1
      ) w ON TRUE
      WHERE sri."saleReturnId" = sr."id"
        AND sri."warehouseId" IS NULL
    `);

    for (const table of ITEM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "warehouseId" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_warehouse" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ITEM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_warehouse"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "warehouseId"`,
      );
    }
  }
}
