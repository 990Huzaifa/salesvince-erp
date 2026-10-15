import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClaimVendorShipmentStatusFields1792057000000
  implements MigrationInterface
{
  name = 'ClaimVendorShipmentStatusFields1792057000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claim_vendor_shipments" ADD "status" "public"."claim_vendor_shipments_shipmentstatus_enum" NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `UPDATE "claim_vendor_shipments" SET "status" = "shipmentStatus"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."claim_vendor_shipment_items_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_vendor_shipment_items" ADD "status" "public"."claim_vendor_shipment_items_status_enum" NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_vendor_shipment_items" ADD "rejectReason" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claim_vendor_shipment_items" DROP COLUMN "rejectReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_vendor_shipment_items" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."claim_vendor_shipment_items_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_vendor_shipments" DROP COLUMN "status"`,
    );
  }
}
