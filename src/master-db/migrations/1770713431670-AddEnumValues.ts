import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEnumValues1770713431670 implements MigrationInterface {
    name = 'AddEnumValues1770713431670'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."tenant_settings_currency_enum" RENAME TO "tenant_settings_currency_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_currency_enum" AS ENUM('USD', 'SAR', 'KWD', 'AED', 'PKR')`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "currency" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "currency" TYPE "public"."tenant_settings_currency_enum" USING "currency"::"text"::"public"."tenant_settings_currency_enum"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "currency" SET DEFAULT 'USD'`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_currency_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."tenant_settings_baseuom_enum" RENAME TO "tenant_settings_baseuom_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_baseuom_enum" AS ENUM('PCS', 'LTR', 'KGS')`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "baseUom" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "baseUom" TYPE "public"."tenant_settings_baseuom_enum" USING "baseUom"::"text"::"public"."tenant_settings_baseuom_enum"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "baseUom" SET DEFAULT 'PCS'`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_baseuom_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_baseuom_enum_old" AS ENUM('PCS', 'LTR')`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "baseUom" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "baseUom" TYPE "public"."tenant_settings_baseuom_enum_old" USING "baseUom"::"text"::"public"."tenant_settings_baseuom_enum_old"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "baseUom" SET DEFAULT 'PCS'`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_baseuom_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."tenant_settings_baseuom_enum_old" RENAME TO "tenant_settings_baseuom_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_settings_currency_enum_old" AS ENUM('USD', 'SAR')`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "currency" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "currency" TYPE "public"."tenant_settings_currency_enum_old" USING "currency"::"text"::"public"."tenant_settings_currency_enum_old"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "currency" SET DEFAULT 'USD'`);
        await queryRunner.query(`DROP TYPE "public"."tenant_settings_currency_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."tenant_settings_currency_enum_old" RENAME TO "tenant_settings_currency_enum"`);
    }

}
