import { MigrationInterface, QueryRunner } from 'typeorm';

const SALE_ITEM_TABLES = [
  'sale_order_items',
  'delivery_note_items',
  'sale_invoice_items',
  'sale_return_items',
] as const;

export class ServicesAndSaleItemType1792260000000
  implements MigrationInterface
{
  name = 'ServicesAndSaleItemType1792260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "services" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "saleUnitPrice" numeric(18,2) NOT NULL DEFAULT 0,
        "chartOfAccountId" uuid,
        "isActive" boolean NOT NULL DEFAULT true,
        "isDelete" boolean NOT NULL DEFAULT false,
        "createdBy" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_services_code" UNIQUE ("code"),
        CONSTRAINT "PK_services_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_services_businessId_name" ON "services" ("businessId", "name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_services_businessId"
        FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_services_chartOfAccountId"
        FOREIGN KEY ("chartOfAccountId") REFERENCES "chart_of_accounts"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_services_createdBy"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."sale_item_type_enum" AS ENUM('PRODUCT', 'SERVICE')`,
    );

    for (const table of SALE_ITEM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD "itemType" "public"."sale_item_type_enum" NOT NULL DEFAULT 'PRODUCT'`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" ADD "serviceId" uuid`);
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "productId" DROP NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "warehouseId" DROP NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "uomId" DROP NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_serviceId"
          FOREIGN KEY ("serviceId") REFERENCES "services"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of SALE_ITEM_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "FK_${table}_serviceId"`,
      );
      // Service lines cannot exist once product columns are NOT NULL again.
      await queryRunner.query(
        `DELETE FROM "${table}" WHERE "itemType" = 'SERVICE'`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "uomId" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "warehouseId" SET NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "productId" SET NOT NULL`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "serviceId"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "itemType"`);
    }

    await queryRunner.query(`DROP TYPE "public"."sale_item_type_enum"`);
    await queryRunner.query(`DROP TABLE "services"`);
  }
}
