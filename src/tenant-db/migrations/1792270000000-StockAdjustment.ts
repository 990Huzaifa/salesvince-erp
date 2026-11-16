import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockAdjustment1792270000000 implements MigrationInterface {
  name = 'StockAdjustment1792270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."stock_adjustments_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."stock_adjustment_items_direction_enum" AS ENUM('INCREASE', 'DECREASE')`,
    );

    await queryRunner.query(`
      CREATE TABLE "stock_adjustments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "adjustmentNumber" character varying NOT NULL,
        "adjustmentDate" TIMESTAMP NOT NULL,
        "warehouseId" uuid NOT NULL,
        "notes" character varying,
        "createdBy" uuid NOT NULL,
        "status" "public"."stock_adjustments_status_enum" NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UQ_stock_adjustments_adjustmentNumber" UNIQUE ("adjustmentNumber"),
        CONSTRAINT "PK_stock_adjustments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_adjustment_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "stockAdjustmentId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "productFlavourId" uuid,
        "uomId" uuid NOT NULL,
        "direction" "public"."stock_adjustment_items_direction_enum" NOT NULL,
        "quantity" integer NOT NULL,
        "purchaseUnitPrice" numeric(18,2),
        "saleUnitPrice" numeric(18,2),
        "batchNumber" character varying,
        "expiryDate" TIMESTAMP,
        "reason" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_adjustment_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "FK_stock_adjustments_business"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "FK_stock_adjustments_warehouse"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustments"
      ADD CONSTRAINT "FK_stock_adjustments_created_by"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustment_items"
      ADD CONSTRAINT "FK_stock_adjustment_items_adjustment"
      FOREIGN KEY ("stockAdjustmentId") REFERENCES "stock_adjustments"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustment_items"
      ADD CONSTRAINT "FK_stock_adjustment_items_product"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustment_items"
      ADD CONSTRAINT "FK_stock_adjustment_items_flavour"
      FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "stock_adjustment_items"
      ADD CONSTRAINT "FK_stock_adjustment_items_uom"
      FOREIGN KEY ("uomId") REFERENCES "uoms"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stock_adjustment_items" DROP CONSTRAINT "FK_stock_adjustment_items_uom"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_adjustment_items" DROP CONSTRAINT "FK_stock_adjustment_items_flavour"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_adjustment_items" DROP CONSTRAINT "FK_stock_adjustment_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_adjustment_items" DROP CONSTRAINT "FK_stock_adjustment_items_adjustment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" DROP CONSTRAINT "FK_stock_adjustments_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" DROP CONSTRAINT "FK_stock_adjustments_warehouse"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_adjustments" DROP CONSTRAINT "FK_stock_adjustments_business"`,
    );
    await queryRunner.query(`DROP TABLE "stock_adjustment_items"`);
    await queryRunner.query(`DROP TABLE "stock_adjustments"`);
    await queryRunner.query(
      `DROP TYPE "public"."stock_adjustment_items_direction_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."stock_adjustments_status_enum"`,
    );
  }
}
