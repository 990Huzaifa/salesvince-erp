import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateIndustryType1770818996957 implements MigrationInterface {
    name = 'UpdateIndustryType1770818996957'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."tenants_industrytype_enum" RENAME TO "tenants_industrytype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."tenants_industrytype_enum" AS ENUM('SOFTWARE', 'RETAIL', 'SERVICES', 'BRAND', 'MANUFACTURING', 'WHOLESALE', 'OTHER')`);
        await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "industryType" TYPE "public"."tenants_industrytype_enum" USING "industryType"::"text"::"public"."tenants_industrytype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_industrytype_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenants_industrytype_enum_old" AS ENUM('SOFTWARE', 'RETAIL', 'SERVICES', 'MANUFACTURING', 'WHOLESALE', 'OTHER')`);
        await queryRunner.query(`ALTER TABLE "tenants" ALTER COLUMN "industryType" TYPE "public"."tenants_industrytype_enum_old" USING "industryType"::"text"::"public"."tenants_industrytype_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_industrytype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."tenants_industrytype_enum_old" RENAME TO "tenants_industrytype_enum"`);
    }

}
