import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClaimModule1785218800000 implements MigrationInterface {
  name = 'ClaimModule1785218800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."claims_sourcetype_enum" AS ENUM('CUSTOMER', 'OWN_LOCATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claims_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'VALIDATED', 'INVALID_DISCARDED', 'SENT_TO_VENDOR', 'RECEIVED_FROM_VENDOR', 'VENDOR_ACCEPTED', 'VENDOR_REJECTED_DISCARD', 'DELIVERED_TO_CUSTOMER', 'RETURNED_TO_LOCATION', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claim_items_unitoutcome_enum" AS ENUM('PENDING', 'VENDOR_ACCEPTED', 'VENDOR_REJECTED', 'DISCARDED', 'DELIVERED', 'RETURNED_TO_STOCK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."claim_items_discardtype_enum" AS ENUM('AS_IS', 'SCRAP')`,
    );

    await queryRunner.query(`
      CREATE TABLE "claims" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "claimNumber" character varying NOT NULL,
        "claimDate" date NOT NULL,
        "sourceType" "public"."claims_sourcetype_enum" NOT NULL,
        "partyId" uuid,
        "warehouseId" uuid,
        "vendorId" uuid,
        "status" "public"."claims_status_enum" NOT NULL DEFAULT 'DRAFT',
        "isValid" boolean,
        "invalidReason" text,
        "notes" text,
        "createdBy" uuid,
        "closedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_claims_claimNumber" UNIQUE ("claimNumber"),
        CONSTRAINT "PK_claims" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "claim_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "claimId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "productFlavourId" integer,
        "uomId" uuid NOT NULL,
        "warehouseId" uuid NOT NULL,
        "claimBatchId" uuid,
        "claimedQuantity" integer NOT NULL,
        "unitOutcome" "public"."claim_items_unitoutcome_enum" NOT NULL DEFAULT 'PENDING',
        "discardType" "public"."claim_items_discardtype_enum",
        "discardReason" text,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_claim_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "claim_batches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "claimId" uuid NOT NULL,
        "claimItemId" uuid,
        "batchNumber" character varying NOT NULL,
        "productId" uuid NOT NULL,
        "productFlavourId" integer,
        "uomId" uuid NOT NULL,
        "warehouseId" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "originalQuantity" integer NOT NULL,
        "batchDate" date NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_claim_batches" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "claim_stocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "warehouseId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "uomId" uuid NOT NULL,
        "productFlavourId" integer,
        "quantityOnHand" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_claim_stocks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_claim_stocks_active_business_warehouse_product_uom_flavour"
      ON "claim_stocks" ("businessId", "warehouseId", "productId", "uomId", "productFlavourId")
      WHERE "deletedAt" IS NULL
    `);

    // claims FKs
    await queryRunner.query(`
      ALTER TABLE "claims"
      ADD CONSTRAINT "FK_claims_businessId"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "claims"
      ADD CONSTRAINT "FK_claims_partyId"
      FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claims"
      ADD CONSTRAINT "FK_claims_warehouseId"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claims"
      ADD CONSTRAINT "FK_claims_vendorId"
      FOREIGN KEY ("vendorId") REFERENCES "parties"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claims"
      ADD CONSTRAINT "FK_claims_createdBy"
      FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // claim_items FKs (claimBatchId after claim_batches exists)
    await queryRunner.query(`
      ALTER TABLE "claim_items"
      ADD CONSTRAINT "FK_claim_items_claimId"
      FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_items"
      ADD CONSTRAINT "FK_claim_items_productId"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_items"
      ADD CONSTRAINT "FK_claim_items_productFlavourId"
      FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_items"
      ADD CONSTRAINT "FK_claim_items_uomId"
      FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_items"
      ADD CONSTRAINT "FK_claim_items_warehouseId"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT
    `);

    // claim_batches FKs
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_businessId"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_claimId"
      FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_claimItemId"
      FOREIGN KEY ("claimItemId") REFERENCES "claim_items"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_productId"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_productFlavourId"
      FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_uomId"
      FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_batches"
      ADD CONSTRAINT "FK_claim_batches_warehouseId"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "claim_items"
      ADD CONSTRAINT "FK_claim_items_claimBatchId"
      FOREIGN KEY ("claimBatchId") REFERENCES "claim_batches"("id") ON DELETE SET NULL
    `);

    // claim_stocks FKs
    await queryRunner.query(`
      ALTER TABLE "claim_stocks"
      ADD CONSTRAINT "FK_claim_stocks_businessId"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_stocks"
      ADD CONSTRAINT "FK_claim_stocks_warehouseId"
      FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_stocks"
      ADD CONSTRAINT "FK_claim_stocks_productId"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_stocks"
      ADD CONSTRAINT "FK_claim_stocks_uomId"
      FOREIGN KEY ("uomId") REFERENCES "uoms"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "claim_stocks"
      ADD CONSTRAINT "FK_claim_stocks_productFlavourId"
      FOREIGN KEY ("productFlavourId") REFERENCES "product_flavours"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claim_stocks" DROP CONSTRAINT "FK_claim_stocks_productFlavourId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_stocks" DROP CONSTRAINT "FK_claim_stocks_uomId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_stocks" DROP CONSTRAINT "FK_claim_stocks_productId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_stocks" DROP CONSTRAINT "FK_claim_stocks_warehouseId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_stocks" DROP CONSTRAINT "FK_claim_stocks_businessId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "claim_items" DROP CONSTRAINT "FK_claim_items_claimBatchId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_warehouseId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_uomId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_productFlavourId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_productId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_claimItemId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_claimId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_claim_batches_businessId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "claim_items" DROP CONSTRAINT "FK_claim_items_warehouseId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_items" DROP CONSTRAINT "FK_claim_items_uomId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_items" DROP CONSTRAINT "FK_claim_items_productFlavourId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_items" DROP CONSTRAINT "FK_claim_items_productId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_items" DROP CONSTRAINT "FK_claim_items_claimId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_claims_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_claims_vendorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_claims_warehouseId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_claims_partyId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "claims" DROP CONSTRAINT "FK_claims_businessId"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_claim_stocks_active_business_warehouse_product_uom_flavour"`,
    );
    await queryRunner.query(`DROP TABLE "claim_stocks"`);
    await queryRunner.query(`DROP TABLE "claim_batches"`);
    await queryRunner.query(`DROP TABLE "claim_items"`);
    await queryRunner.query(`DROP TABLE "claims"`);

    await queryRunner.query(
      `DROP TYPE "public"."claim_items_discardtype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."claim_items_unitoutcome_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."claims_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."claims_sourcetype_enum"`);
  }
}
