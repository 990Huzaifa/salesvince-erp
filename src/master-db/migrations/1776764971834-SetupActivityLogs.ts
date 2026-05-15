import { MigrationInterface, QueryRunner } from "typeorm";

export class SetupActivityLogs1776764971834 implements MigrationInterface {
    name = 'SetupActivityLogs1776764971834'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_actortype_enum" AS ENUM('PLATFORM_USER', 'SYSTEM')`);
        await queryRunner.query(`CREATE TABLE "activity_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorType" "public"."activity_logs_actortype_enum" NOT NULL, "actorId" character varying, "tenantId" character varying, "action" character varying NOT NULL, "description" text, "metadata" jsonb, "jobId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f25287b6140c5ba18d38776a796" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "activity_logs"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_actortype_enum"`);
    }

}
