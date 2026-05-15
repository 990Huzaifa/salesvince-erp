import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangesInAnnouncementAgain1776321643253 implements MigrationInterface {
    name = 'ChangesInAnnouncementAgain1776321643253'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "announcement_plans" DROP CONSTRAINT "FK_1eafe016fcd746622d8bbe96cb1"`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" DROP COLUMN "plan_id"`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ADD "plan_id" integer`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ALTER COLUMN "announcement_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" DROP CONSTRAINT "FK_e59896f0500bd6711f71443c6c7"`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" DROP COLUMN "tenant_id"`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ADD "tenant_id" uuid`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ALTER COLUMN "announcement_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ADD CONSTRAINT "FK_1eafe016fcd746622d8bbe96cb1" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ADD CONSTRAINT "FK_e59896f0500bd6711f71443c6c7" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "announcement_tenants" DROP CONSTRAINT "FK_e59896f0500bd6711f71443c6c7"`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" DROP CONSTRAINT "FK_1eafe016fcd746622d8bbe96cb1"`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ALTER COLUMN "announcement_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" DROP COLUMN "tenant_id"`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ADD "tenant_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ADD CONSTRAINT "FK_e59896f0500bd6711f71443c6c7" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ALTER COLUMN "announcement_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" DROP COLUMN "plan_id"`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ADD "plan_id" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ADD CONSTRAINT "FK_1eafe016fcd746622d8bbe96cb1" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
