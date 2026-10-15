import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Runs after StatusFields and before ClaimFull.
 *
 * StatusFields already creates item status/rejectReason (and a duplicate
 * shipment "status" column). ClaimFull also creates those — so remove the
 * StatusFields copies when ClaimFull has not been applied yet.
 *
 * Also clears stub claim_vendor_receipts rows so ClaimFull can ADD NOT NULL columns.
 */
export class ClaimPreClaimFullCleanup1792058500000
  implements MigrationInterface
{
  name = 'ClaimPreClaimFullCleanup1792058500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const claimFullTables = await queryRunner.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'claim_discard_reasons'
      LIMIT 1
    `);

    // ClaimFull already applied — leave schema alone
    if (claimFullTables?.length) {
      return;
    }

    // Clear stub receipts (id/claimId/timestamps only) before NOT NULL adds
    const hasReceiptNumber = await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'claim_vendor_receipts'
        AND column_name = 'receiptNumber'
      LIMIT 1
    `);
    if (!hasReceiptNumber?.length) {
      await queryRunner.query(`DELETE FROM "claim_vendor_receipt_items"`);
      await queryRunner.query(`DELETE FROM "claim_vendor_receipts"`);
    }

    // Undo StatusFields item columns/type so ClaimFull can recreate them.
    // ClaimFull adds status NOT NULL without DEFAULT — table must be empty.
    const hasItemStatus = await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'claim_vendor_shipment_items'
        AND column_name = 'status'
      LIMIT 1
    `);
    if (hasItemStatus?.length) {
      await queryRunner.query(`DELETE FROM "claim_vendor_shipment_items"`);
      await queryRunner.query(
        `ALTER TABLE "claim_vendor_shipment_items" DROP COLUMN "rejectReason"`,
      );
      await queryRunner.query(
        `ALTER TABLE "claim_vendor_shipment_items" DROP COLUMN "status"`,
      );
    } else {
      // Still clear rows so ClaimFull ADD status NOT NULL can succeed
      await queryRunner.query(`DELETE FROM "claim_vendor_shipment_items"`);
    }

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."claim_vendor_shipment_items_status_enum"`,
    );

    // Undo duplicate shipment header "status" (entity uses shipmentStatus)
    const hasShipmentStatusCol = await queryRunner.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'claim_vendor_shipments'
        AND column_name = 'status'
      LIMIT 1
    `);
    if (hasShipmentStatusCol?.length) {
      await queryRunner.query(
        `ALTER TABLE "claim_vendor_shipments" DROP COLUMN "status"`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // irreversible cleanup
  }
}
