import { MigrationInterface, QueryRunner } from "typeorm";

export class Changes1776842109166 implements MigrationInterface {
    name = 'Changes1776842109166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP COLUMN "actorId"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD "actorId" uuid`);
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP COLUMN "tenantId"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD "tenantId" uuid`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_110bb0d32b7f65be46be37e2577" FOREIGN KEY ("actorId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_38cc2ea20240678a35991d9f676" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ADD CONSTRAINT "FK_eb835f29610db8ce7aa619f1915" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ADD CONSTRAINT "FK_2b9ad4d85303289a0d85af85f74" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "announcement_tenants" DROP CONSTRAINT "FK_2b9ad4d85303289a0d85af85f74"`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" DROP CONSTRAINT "FK_eb835f29610db8ce7aa619f1915"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "FK_38cc2ea20240678a35991d9f676"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "FK_110bb0d32b7f65be46be37e2577"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP COLUMN "tenantId"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD "tenantId" character varying`);
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP COLUMN "actorId"`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD "actorId" character varying`);
    }

}
