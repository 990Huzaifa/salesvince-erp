import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantTheme1770795625823 implements MigrationInterface {
    name = 'AddTenantTheme1770795625823'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_themes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "primaryColor" character varying NOT NULL DEFAULT '#2563eb', "secondaryColor" character varying NOT NULL DEFAULT '#f3f4f6', "accentColor" character varying NOT NULL DEFAULT '#f59e0b', "darkMode" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenant_id" uuid, CONSTRAINT "REL_b1c6aaa6ddcc8ff38da4496cec" UNIQUE ("tenant_id"), CONSTRAINT "PK_b1ccffa44c6d16541f76d6702c4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant_themes" ADD CONSTRAINT "FK_b1c6aaa6ddcc8ff38da4496cec5" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_themes" DROP CONSTRAINT "FK_b1c6aaa6ddcc8ff38da4496cec5"`);
        await queryRunner.query(`DROP TABLE "tenant_themes"`);
    }

}
