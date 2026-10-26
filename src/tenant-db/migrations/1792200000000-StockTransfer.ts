import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockTransfer1792200000000 implements MigrationInterface {
  name = 'StockTransfer1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."stock_transfers_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVERSED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "stock_transfers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "transferNumber" character varying NOT NULL,
        "transferDate" TIMESTAMP NOT NULL,
        "fromWarehouseId" uuid NOT NULL,
        "toWarehouseId" uuid NOT NULL,
        "notes" character varying,
        "createdBy" uuid NOT NULL,
        "status" "public"."stock_transfers_status_enum" NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UQ_stock_transfers_transferNumber" UNIQUE ("transferNumber"),
        CONSTRAINT "PK_stock_transfers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_transfer_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stockTransferId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "productFlavourId" uuid,
        "uomId" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_transfer_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD CONSTRAINT "FK_stock_transfers_business"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD CONSTRAINT "FK_stock_transfers_from_warehouse"
      FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD CONSTRAINT "FK_stock_transfers_to_warehouse"
      FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfers"
      ADD CONSTRAINT "FK_stock_transfers_created_by"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfer_items"
      ADD CONSTRAINT "FK_stock_transfer_items_transfer"
      FOREIGN KEY ("stockTransferId") REFERENCES "stock_transfers"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfer_items"
      ADD CONSTRAINT "FK_stock_transfer_items_product"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfer_items"
      ADD CONSTRAINT "FK_stock_transfer_items_flavour"
      FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_transfer_items"
      ADD CONSTRAINT "FK_stock_transfer_items_uom"
      FOREIGN KEY ("uomId") REFERENCES "uoms"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "FK_stock_transfer_items_uom"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "FK_stock_transfer_items_flavour"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "FK_stock_transfer_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "FK_stock_transfer_items_transfer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_stock_transfers_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_stock_transfers_to_warehouse"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_stock_transfers_from_warehouse"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_stock_transfers_business"`,
    );
    await queryRunner.query(`DROP TABLE "stock_transfer_items"`);
    await queryRunner.query(`DROP TABLE "stock_transfers"`);
    await queryRunner.query(`DROP TYPE "public"."stock_transfers_status_enum"`);
  }
}
