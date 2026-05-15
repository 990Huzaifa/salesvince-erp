import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantEmail1770619650263 implements MigrationInterface {
    name = 'AddTenantEmail1770619650263'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_db_configs" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD "email" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD CONSTRAINT "UQ_155c343439adc83ada6ee3f48be" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD CONSTRAINT "UQ_32731f181236a46182a38c992a8" UNIQUE ("name")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "UQ_32731f181236a46182a38c992a8"`);
        await queryRunner.query(`ALTER TABLE "tenants" DROP CONSTRAINT "UQ_155c343439adc83ada6ee3f48be"`);
        await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "tenant_db_configs" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    }

}
