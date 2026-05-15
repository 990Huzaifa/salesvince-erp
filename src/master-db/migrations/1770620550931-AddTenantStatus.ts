import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantStatus1770620550931 implements MigrationInterface {
    name = 'AddTenantStatus1770620550931'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenants_status_enum" AS ENUM('REGISTERED', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'SUSPENDED')`);
        await queryRunner.query(`ALTER TABLE "tenants" ADD "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'REGISTERED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
    }

}
