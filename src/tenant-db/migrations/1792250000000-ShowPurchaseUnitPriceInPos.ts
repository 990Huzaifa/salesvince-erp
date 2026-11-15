import { MigrationInterface, QueryRunner } from 'typeorm';

export class ShowPurchaseUnitPriceInPos1792250000000
  implements MigrationInterface
{
  name = 'ShowPurchaseUnitPriceInPos1792250000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "business_settings"
      ADD "showPurchaseUnitPriceInPos" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "business_settings"
      DROP COLUMN "showPurchaseUnitPriceInPos"
    `);
  }
}
