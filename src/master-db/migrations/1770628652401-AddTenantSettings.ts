import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantSettings1770628652401 implements MigrationInterface {
    name = 'AddTenantSettings1770628652401'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_currency_enum" AS ENUM('USD', 'SAR')`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_baseuom_enum" AS ENUM('PCS', 'LTR')`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_baselocale_enum" AS ENUM('en', 'ar')`);
        await queryRunner.query(`CREATE TABLE "tenant_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "timezone" character varying NOT NULL DEFAULT 'UTC', "currency" "public"."tenant_settings_currency_enum" NOT NULL DEFAULT 'USD', "baseUom" "public"."tenant_settings_baseuom_enum" NOT NULL DEFAULT 'PCS', "baseLocale" "public"."tenant_settings_baselocale_enum" NOT NULL DEFAULT 'en', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenant_id" uuid, CONSTRAINT "REL_a6abc1c3ed0df635955fc852f1" UNIQUE ("tenant_id"), CONSTRAINT "PK_69225c0ca64bcbbf9af8a217043" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_a6abc1c3ed0df635955fc852f1c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT "FK_a6abc1c3ed0df635955fc852f1c"`);
        await queryRunner.query(`DROP TABLE "tenant_settings"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_baselocale_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_baseuom_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_currency_enum"`);
    }

}
