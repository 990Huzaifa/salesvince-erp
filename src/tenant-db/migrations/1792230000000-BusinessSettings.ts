import { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessSettings1792230000000 implements MigrationInterface {
  name = 'BusinessSettings1792230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."business_settings_defaultpaymentmethod_enum" AS ENUM(
        'CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "business_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessId" uuid NOT NULL,
        "defaultPaymentMethod" "public"."business_settings_defaultpaymentmethod_enum",
        "defaultVoucherPaymentCoaId" uuid,
        "defaultDocumentTemplateId" uuid,
        "defaultWarehouseId" uuid,
        "defaultCountryId" uuid,
        "defaultStateId" uuid,
        "defaultCityId" uuid,
        "extras" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_business_settings_businessId" UNIQUE ("businessId"),
        CONSTRAINT "PK_business_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "business_settings"
      ADD CONSTRAINT "FK_business_settings_business"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "business_settings"
      ADD CONSTRAINT "FK_business_settings_voucher_coa"
      FOREIGN KEY ("defaultVoucherPaymentCoaId") REFERENCES "chart_of_accounts"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "business_settings"
      ADD CONSTRAINT "FK_business_settings_warehouse"
      FOREIGN KEY ("defaultWarehouseId") REFERENCES "warehouses"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "business_settings" DROP CONSTRAINT "FK_business_settings_warehouse"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_settings" DROP CONSTRAINT "FK_business_settings_voucher_coa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_settings" DROP CONSTRAINT "FK_business_settings_business"`,
    );
    await queryRunner.query(`DROP TABLE "business_settings"`);
    await queryRunner.query(
      `DROP TYPE "public"."business_settings_defaultpaymentmethod_enum"`,
    );
  }
}
