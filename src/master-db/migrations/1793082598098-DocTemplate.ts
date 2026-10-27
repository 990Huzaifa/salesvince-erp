import { MigrationInterface, QueryRunner } from "typeorm";

export class DocTemplate1793082598098 implements MigrationInterface {
    name = 'DocTemplate1793082598098'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."document_template_items_documenttype_enum" AS ENUM('SALE_INVOICE', 'PURCHASE_INVOICE', 'SALE_ORDER', 'PURCHASE_ORDER', 'WAREHOUSE_SLIP', 'GRN', 'PAYSLIP', 'PARTY_LEDGER', 'GENERAL_LEDGER', 'ACCOUNTS_LIST', 'VOUCHER', 'REPORT')`);
        await queryRunner.query(`CREATE TYPE "public"."document_template_items_sourcetype_enum" AS ENUM('INLINE', 'FILE')`);
        await queryRunner.query(`CREATE TYPE "public"."document_template_items_engine_enum" AS ENUM('HTML', 'HANDLEBARS')`);
        await queryRunner.query(`CREATE TABLE "document_template_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "templateId" uuid NOT NULL, "documentType" "public"."document_template_items_documenttype_enum" NOT NULL, "name" character varying, "sourceType" "public"."document_template_items_sourcetype_enum" NOT NULL DEFAULT 'INLINE', "engine" "public"."document_template_items_engine_enum" NOT NULL DEFAULT 'HTML', "content" text, "fileUrl" character varying, "fileMimeType" character varying, "pageSettings" jsonb, "variables" jsonb, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_document_template_items_template_doctype" UNIQUE ("templateId", "documentType"), CONSTRAINT "PK_fea0a859dfaf005ced04929bd73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_document_template_items_templateId" ON "document_template_items" ("templateId") `);
        await queryRunner.query(`CREATE TYPE "public"."document_templates_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "document_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "description" text, "previewImageUrl" character varying, "isDefault" boolean NOT NULL DEFAULT false, "status" "public"."document_templates_status_enum" NOT NULL DEFAULT 'ACTIVE', "sortOrder" integer NOT NULL DEFAULT '0', "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4dfa5bb611939517d690b005240" UNIQUE ("code"), CONSTRAINT "PK_0372838b7b7cd3571aef80466d1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenant_document_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" uuid NOT NULL, "templateId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_tenant_document_templates_tenant" UNIQUE ("tenantId"), CONSTRAINT "PK_948eb706f3f9c572a7778183c54" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_tenant_document_templates_templateId" ON "tenant_document_templates" ("templateId") `);
        await queryRunner.query(`ALTER TABLE "document_template_items" ADD CONSTRAINT "FK_fa1b5d06b7f324ffd55dffc80c9" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_document_templates" ADD CONSTRAINT "FK_d5452fb8cd9f9619e11a1c34303" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_document_templates" ADD CONSTRAINT "FK_42290658945a7eb4d6af2bcd907" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_document_templates" DROP CONSTRAINT "FK_42290658945a7eb4d6af2bcd907"`);
        await queryRunner.query(`ALTER TABLE "tenant_document_templates" DROP CONSTRAINT "FK_d5452fb8cd9f9619e11a1c34303"`);
        await queryRunner.query(`ALTER TABLE "document_template_items" DROP CONSTRAINT "FK_fa1b5d06b7f324ffd55dffc80c9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_tenant_document_templates_templateId"`);
        await queryRunner.query(`DROP TABLE "tenant_document_templates"`);
        await queryRunner.query(`DROP TABLE "document_templates"`);
        await queryRunner.query(`DROP TYPE "public"."document_templates_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_document_template_items_templateId"`);
        await queryRunner.query(`DROP TABLE "document_template_items"`);
        await queryRunner.query(`DROP TYPE "public"."document_template_items_engine_enum"`);
        await queryRunner.query(`DROP TYPE "public"."document_template_items_sourcetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."document_template_items_documenttype_enum"`);
    }

}
