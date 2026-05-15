import { MigrationInterface, QueryRunner } from "typeorm";

export class AnnouncementsSetup1776079808199 implements MigrationInterface {
    name = 'AnnouncementsSetup1776079808199'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."announcements_displaymode_enum" AS ENUM('BANNER', 'MODAL')`);
        await queryRunner.query(`CREATE TYPE "public"."announcements_type_enum" AS ENUM('INFO', 'WARNING', 'ERROR', 'SUCCESS')`);
        await queryRunner.query(`CREATE TYPE "public"."announcements_targetscope_enum" AS ENUM('GLOBAL', 'TENANT', 'PLAN')`);
        await queryRunner.query(`CREATE TABLE "announcements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "message" character varying NOT NULL, "priority" integer NOT NULL DEFAULT '1', "isActive" boolean NOT NULL DEFAULT true, "displayMode" "public"."announcements_displaymode_enum" NOT NULL DEFAULT 'BANNER', "type" "public"."announcements_type_enum" NOT NULL DEFAULT 'INFO', "targetScope" "public"."announcements_targetscope_enum" NOT NULL DEFAULT 'GLOBAL', "isDismissable" boolean NOT NULL DEFAULT true, "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "announcement_tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "announcement_id" uuid NOT NULL, "tenant_id" character varying NOT NULL, CONSTRAINT "PK_d4ec6fe7ab2bdcd9c6aaa848d8c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "announcement_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "announcement_id" uuid NOT NULL, "plan_id" character varying NOT NULL, CONSTRAINT "PK_d24be7309348eba537895dfe0b4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" ADD CONSTRAINT "FK_e59896f0500bd6711f71443c6c7" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "announcement_plans" ADD CONSTRAINT "FK_1eafe016fcd746622d8bbe96cb1" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "announcement_plans" DROP CONSTRAINT "FK_1eafe016fcd746622d8bbe96cb1"`);
        await queryRunner.query(`ALTER TABLE "announcement_tenants" DROP CONSTRAINT "FK_e59896f0500bd6711f71443c6c7"`);
        await queryRunner.query(`DROP TABLE "announcement_plans"`);
        await queryRunner.query(`DROP TABLE "announcement_tenants"`);
        await queryRunner.query(`DROP TABLE "announcements"`);
        await queryRunner.query(`DROP TYPE "public"."announcements_targetscope_enum"`);
        await queryRunner.query(`DROP TYPE "public"."announcements_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."announcements_displaymode_enum"`);
    }

}
