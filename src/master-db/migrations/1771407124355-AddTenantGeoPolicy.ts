import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantGeoPolicy1771407124355 implements MigrationInterface {
    name = 'AddTenantGeoPolicy1771407124355'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenant_geo_policies_scope_type_enum" AS ENUM('GLOBAL', 'COUNTRY', 'STATE')`);
        await queryRunner.query(`CREATE TABLE "tenant_geo_policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scope_type" "public"."tenant_geo_policies_scope_type_enum" NOT NULL DEFAULT 'GLOBAL', "country_id" uuid, "state_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid, CONSTRAINT "REL_602f1bfc60fb24dedaa6fbe09a" UNIQUE ("tenantId"), CONSTRAINT "PK_830c809b0b3b6fee5cd4f4aae75" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" ADD CONSTRAINT "FK_602f1bfc60fb24dedaa6fbe09a3" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" DROP CONSTRAINT "FK_602f1bfc60fb24dedaa6fbe09a3"`);
        await queryRunner.query(`DROP TABLE "tenant_geo_policies"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_geo_policies_scope_type_enum"`);
    }

}
