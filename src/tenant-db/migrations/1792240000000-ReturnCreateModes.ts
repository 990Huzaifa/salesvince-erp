import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReturnCreateModes1792240000000 implements MigrationInterface {
  name = 'ReturnCreateModes1792240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sale_returns_returnmode_enum" AS ENUM('INVOICE', 'CUSTOMER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."purchase_returns_returnmode_enum" AS ENUM('INVOICE', 'SUPPLIER')`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_returns" ADD "returnMode" "public"."sale_returns_returnmode_enum" NOT NULL DEFAULT 'INVOICE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" ADD "customerId" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ADD "returnMode" "public"."purchase_returns_returnmode_enum" NOT NULL DEFAULT 'INVOICE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ADD "vendorId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ADD "warehouseId" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_return_items" ADD "saleUnitPrice" numeric(18,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_return_items" ADD "purchaseUnitPrice" numeric(18,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_return_items" ADD "purchaseUnitPrice" numeric(18,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_return_items" ADD "saleUnitPrice" numeric(18,2) NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(`
      UPDATE "sale_returns" sr
      SET "customerId" = si."customerId"
      FROM "sale_invoices" si
      WHERE si."id" = sr."saleInvoiceId"
    `);

    await queryRunner.query(`
      UPDATE "purchase_returns" pr
      SET "vendorId" = pi."vendorId"
      FROM "purchase_invoices" pi
      WHERE pi."id" = pr."purchaseInvoiceId"
    `);

    await queryRunner.query(
      `ALTER TABLE "sale_returns" ALTER COLUMN "customerId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ALTER COLUMN "vendorId" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "FK_sale_returns_saleInvoiceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" ALTER COLUMN "saleInvoiceId" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP CONSTRAINT IF EXISTS "FK_purchase_returns_purchaseInvoiceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ALTER COLUMN "purchaseInvoiceId" DROP NOT NULL`,
    );

    // Discover existing FK names if they differ from IF EXISTS above
    await queryRunner.query(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = 'sale_returns'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'saleInvoiceId'
        LIMIT 1;
        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "sale_returns" DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = 'purchase_returns'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'purchaseInvoiceId'
        LIMIT 1;
        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "purchase_returns" DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "sale_returns" ALTER COLUMN "saleInvoiceId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ALTER COLUMN "purchaseInvoiceId" DROP NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "sale_returns"
        ADD CONSTRAINT "FK_sale_returns_saleInvoiceId"
        FOREIGN KEY ("saleInvoiceId") REFERENCES "sale_invoices"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "sale_returns"
        ADD CONSTRAINT "FK_sale_returns_customerId"
        FOREIGN KEY ("customerId") REFERENCES "parties"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
        ADD CONSTRAINT "FK_purchase_returns_purchaseInvoiceId"
        FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
        ADD CONSTRAINT "FK_purchase_returns_vendorId"
        FOREIGN KEY ("vendorId") REFERENCES "parties"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "purchase_returns"
        ADD CONSTRAINT "FK_purchase_returns_warehouseId"
        FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP CONSTRAINT IF EXISTS "FK_purchase_returns_warehouseId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP CONSTRAINT IF EXISTS "FK_purchase_returns_vendorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "FK_sale_returns_customerId"`,
    );

    await queryRunner.query(
      `DELETE FROM "sale_returns" WHERE "saleInvoiceId" IS NULL`,
    );
    await queryRunner.query(
      `DELETE FROM "purchase_returns" WHERE "purchaseInvoiceId" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_returns" ALTER COLUMN "saleInvoiceId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ALTER COLUMN "purchaseInvoiceId" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "sale_return_items" DROP COLUMN "purchaseUnitPrice"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_return_items" DROP COLUMN "saleUnitPrice"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_return_items" DROP COLUMN "saleUnitPrice"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_return_items" DROP COLUMN "purchaseUnitPrice"`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP COLUMN "warehouseId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP COLUMN "vendorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP COLUMN "returnMode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" DROP COLUMN "customerId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" DROP COLUMN "returnMode"`,
    );

    await queryRunner.query(
      `DROP TYPE "public"."purchase_returns_returnmode_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."sale_returns_returnmode_enum"`,
    );
  }
}
