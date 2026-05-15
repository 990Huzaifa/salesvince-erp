import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateColIndustryType1770707663877 implements MigrationInterface {
    name = 'UpdateColIndustryType1770707663877'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "displayName" character varying NOT NULL, "logoUrl" character varying, "phone" character varying, "address" character varying, "supportEmail" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenant_id" uuid, CONSTRAINT "REL_7755f200fd5c61591cecffa98d" UNIQUE ("tenant_id"), CONSTRAINT "PK_2a7607ec8fe2028dc77670f64c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tenants_industrytype_enum" AS ENUM('SOFTWARE', 'RETAIL', 'SERVICES', 'MANUFACTURING', 'WHOLESALE', 'OTHER')`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD "industryType" "public"."tenants_industrytype_enum"`);
        await queryRunner.query(`ALTER TABLE "tenant_profiles" ADD CONSTRAINT "FK_7755f200fd5c61591cecffa98d0" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_profiles" DROP CONSTRAINT "FK_7755f200fd5c61591cecffa98d0"`);
        await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "industryType"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_industrytype_enum"`);
        await queryRunner.query(`DROP TABLE "tenant_profiles"`);
    }

}
