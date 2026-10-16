import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductPricingType1792060000000 implements MigrationInterface {
  name = 'ProductPricingType1792060000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."product_pricings_pricingtype_enum" AS ENUM('BY_AMOUNT', 'BY_MARGIN')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_pricings" ADD "pricingType" "public"."product_pricings_pricingtype_enum" NOT NULL DEFAULT 'BY_AMOUNT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_pricings" ADD "purchasePercentage" numeric(18,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_pricings" ADD "salePercentage" numeric(18,2) NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_pricings" DROP COLUMN "salePercentage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_pricings" DROP COLUMN "purchasePercentage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_pricings" DROP COLUMN "pricingType"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."product_pricings_pricingtype_enum"`,
    );
  }
}
