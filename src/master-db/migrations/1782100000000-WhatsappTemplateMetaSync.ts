import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsappTemplateMetaSync1782100000000 implements MigrationInterface {
    name = 'WhatsappTemplateMetaSync1782100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."whatsapp_templates_metasyncstatus_enum" AS ENUM('NOT_SUBMITTED', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'FAILED')`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "metaTemplateId" character varying`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "metaSyncStatus" "public"."whatsapp_templates_metasyncstatus_enum" NOT NULL DEFAULT 'NOT_SUBMITTED'`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "submittedPayload" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "metaResponse" jsonb`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "rejectionReason" text`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "submittedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "approvedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "rejectedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" ADD "lastSyncedAt" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "lastSyncedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "rejectedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "approvedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "submittedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "rejectionReason"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "metaResponse"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "submittedPayload"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "metaSyncStatus"`,
        );
        await queryRunner.query(
            `ALTER TABLE "whatsapp_templates" DROP COLUMN "metaTemplateId"`,
        );
        await queryRunner.query(
            `DROP TYPE "public"."whatsapp_templates_metasyncstatus_enum"`,
        );
    }
}
