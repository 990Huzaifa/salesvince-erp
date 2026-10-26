import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpeningStock1792220000000 implements MigrationInterface {
  name = 'OpeningStock1792220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."opening_stocks_status_enum" AS ENUM(
        'PENDING',
        'PROCESSING',
        'APPROVED',
        'REJECTED',
        'FAILED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "opening_stocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "openingNumber" character varying NOT NULL,
        "openingDate" TIMESTAMP NOT NULL,
        "warehouseId" uuid NOT NULL,
        "notes" character varying,
        "createdBy" uuid NOT NULL,
        "status" "public"."opening_stocks_status_enum" NOT NULL,
        "jobId" uuid,
        "failureReason" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "UQ_opening_stocks_openingNumber" UNIQUE ("openingNumber"),
        CONSTRAINT "PK_opening_stocks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "opening_stock_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "openingStockId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "productFlavourId" uuid,
        "uomId" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "purchaseUnitPrice" numeric(18,2) NOT NULL,
        "saleUnitPrice" numeric(18,2) NOT NULL,
        "batchNumber" character varying,
        "expiryDate" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_opening_stock_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stocks"
      ADD CONSTRAINT "FK_opening_stocks_business"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stocks"
      ADD CONSTRAINT "FK_opening_stocks_warehouse"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stocks"
      ADD CONSTRAINT "FK_opening_stocks_created_by"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stock_items"
      ADD CONSTRAINT "FK_opening_stock_items_opening"
      FOREIGN KEY ("openingStockId") REFERENCES "opening_stocks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stock_items"
      ADD CONSTRAINT "FK_opening_stock_items_product"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stock_items"
      ADD CONSTRAINT "FK_opening_stock_items_flavour"
      FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "opening_stock_items"
      ADD CONSTRAINT "FK_opening_stock_items_uom"
      FOREIGN KEY ("uomId") REFERENCES "uoms"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "opening_stock_items" DROP CONSTRAINT "FK_opening_stock_items_uom"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opening_stock_items" DROP CONSTRAINT "FK_opening_stock_items_flavour"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opening_stock_items" DROP CONSTRAINT "FK_opening_stock_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opening_stock_items" DROP CONSTRAINT "FK_opening_stock_items_opening"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opening_stocks" DROP CONSTRAINT "FK_opening_stocks_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opening_stocks" DROP CONSTRAINT "FK_opening_stocks_warehouse"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opening_stocks" DROP CONSTRAINT "FK_opening_stocks_business"`,
    );
    await queryRunner.query(`DROP TABLE "opening_stock_items"`);
    await queryRunner.query(`DROP TABLE "opening_stocks"`);
    await queryRunner.query(`DROP TYPE "public"."opening_stocks_status_enum"`);
  }
}
