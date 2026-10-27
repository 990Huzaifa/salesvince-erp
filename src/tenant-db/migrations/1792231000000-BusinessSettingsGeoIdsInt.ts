import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Geo defaults are master country/state/city numeric ids, not UUIDs.
 * Safe for DBs that already ran BusinessSettings with uuid columns.
 */
export class BusinessSettingsGeoIdsInt1792231000000
  implements MigrationInterface
{
  name = 'BusinessSettingsGeoIdsInt1792231000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "business_settings"
        ALTER COLUMN "defaultCountryId" DROP DEFAULT,
        ALTER COLUMN "defaultStateId" DROP DEFAULT,
        ALTER COLUMN "defaultCityId" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "business_settings"
        ALTER COLUMN "defaultCountryId" TYPE integer USING NULL,
        ALTER COLUMN "defaultStateId" TYPE integer USING NULL,
        ALTER COLUMN "defaultCityId" TYPE integer USING NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "business_settings"
        ALTER COLUMN "defaultCountryId" TYPE uuid USING NULL,
        ALTER COLUMN "defaultStateId" TYPE uuid USING NULL,
        ALTER COLUMN "defaultCityId" TYPE uuid USING NULL
    `);
  }
}
