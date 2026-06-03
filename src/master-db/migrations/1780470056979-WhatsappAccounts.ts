import { MigrationInterface, QueryRunner } from "typeorm";

export class WhatsappAccounts1780470056979 implements MigrationInterface {
    name = 'WhatsappAccounts1780470056979'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenant_whatsapp_accounts_provider_enum" AS ENUM('META')`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_whatsapp_accounts_status_enum" AS ENUM('NUMBER_SAVED', 'SETUP_STARTED', 'CONNECTED', 'FAILED', 'DISABLED')`);
        await queryRunner.query(`CREATE TABLE "tenant_whatsapp_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" uuid NOT NULL, "provider" "public"."tenant_whatsapp_accounts_provider_enum" NOT NULL DEFAULT 'META', "displayPhoneNumber" character varying NOT NULL, "phoneCountryCode" character varying NOT NULL, "phoneNationalNumber" character varying NOT NULL, "wabaId" character varying, "phoneNumberId" character varying, "businessAccountId" character varying, "accessToken" text, "tokenExpiresAt" TIMESTAMP, "status" "public"."tenant_whatsapp_accounts_status_enum" NOT NULL DEFAULT 'NUMBER_SAVED', "setupStartedAt" TIMESTAMP, "connectedAt" TIMESTAMP, "failedAt" TIMESTAMP, "disabledAt" TIMESTAMP, "failureReason" text, "createdById" uuid NOT NULL, "setupStartedById" uuid, "connectedById" uuid, "disabledById" uuid, "isDefault" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2adc9d5005c84d08cc866a3709d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."tenant_whatsapp_account_templates_status_enum" AS ENUM('NOT_SUBMITTED', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "tenant_whatsapp_account_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenantId" uuid NOT NULL, "whatsappAccountId" uuid NOT NULL, "templateId" uuid NOT NULL, "metaTemplateId" character varying, "metaTemplateName" character varying NOT NULL, "languageCode" character varying NOT NULL, "status" "public"."tenant_whatsapp_account_templates_status_enum" NOT NULL DEFAULT 'NOT_SUBMITTED', "submittedPayload" jsonb, "metaResponse" jsonb, "rejectionReason" text, "submittedAt" TIMESTAMP, "approvedAt" TIMESTAMP, "rejectedAt" TIMESTAMP, "lastSyncedAt" TIMESTAMP, "isEnabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dc73f921c1f7cc49cd00e112adb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_templates_moduletype_enum" AS ENUM('PURCHASE_ORDER', 'SALE_ORDER', 'PURCHASE_RETURN', 'SALE_RETURN', 'SALE_INVOICE', 'PURCHASE_INVOICE', 'VOUCHER', 'SALARY_SLIP', 'PAYMENT_RECEIPT')`);
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_templates_category_enum" AS ENUM('UTILITY', 'MARKETING', 'AUTHENTICATION')`);
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_templates_headertype_enum" AS ENUM('NONE', 'TEXT', 'IMAGE', 'DOCUMENT', 'VIDEO')`);
        await queryRunner.query(`CREATE TYPE "public"."whatsapp_templates_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "whatsapp_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "metaTemplateName" character varying NOT NULL, "moduleType" "public"."whatsapp_templates_moduletype_enum" NOT NULL, "eventType" character varying, "category" "public"."whatsapp_templates_category_enum" NOT NULL DEFAULT 'UTILITY', "languageCode" character varying NOT NULL DEFAULT 'en', "headerType" "public"."whatsapp_templates_headertype_enum" NOT NULL DEFAULT 'NONE', "headerText" text, "bodyText" text NOT NULL, "footerText" text, "buttons" jsonb, "variables" jsonb, "sampleValues" jsonb, "attachPdf" boolean NOT NULL DEFAULT true, "status" "public"."whatsapp_templates_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c37a7e48e763788446936070d3b" UNIQUE ("code"), CONSTRAINT "PK_73154f2b6ebc019bc3461ee14eb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TYPE "public"."plan_limits_limitkey_enum" RENAME TO "plan_limits_limitkey_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."plan_limits_limitkey_enum" AS ENUM('USER', 'STORAGE', 'BUSINESS', 'EMPLOYEES', 'SQL_AGENT_DAILY', 'SQL_AGENT_MONTHLY', 'WHATSAPP')`);
        await queryRunner.query(`ALTER TABLE "plan_limits" ALTER COLUMN "limitKey" TYPE "public"."plan_limits_limitkey_enum" USING "limitKey"::"text"::"public"."plan_limits_limitkey_enum"`);
        await queryRunner.query(`DROP TYPE "public"."plan_limits_limitkey_enum_old"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" ADD CONSTRAINT "FK_e5bcae3eb96e990398fbe173929" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" ADD CONSTRAINT "FK_97c8ae8c6672cfd98566848f57a" FOREIGN KEY ("createdById") REFERENCES "platform_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" ADD CONSTRAINT "FK_dbb79dd650bf655eaaee2aca705" FOREIGN KEY ("setupStartedById") REFERENCES "platform_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" ADD CONSTRAINT "FK_3fb85efee4d86c4460ee62c8058" FOREIGN KEY ("connectedById") REFERENCES "platform_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" ADD CONSTRAINT "FK_6769b190f7ad4bba69ea7033c78" FOREIGN KEY ("disabledById") REFERENCES "platform_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_account_templates" ADD CONSTRAINT "FK_987bd56e9b90bb0bc103e2289e7" FOREIGN KEY ("whatsappAccountId") REFERENCES "tenant_whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_account_templates" ADD CONSTRAINT "FK_8713aa3a4995d7a3965db95b50e" FOREIGN KEY ("templateId") REFERENCES "whatsapp_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_account_templates" DROP CONSTRAINT "FK_8713aa3a4995d7a3965db95b50e"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_account_templates" DROP CONSTRAINT "FK_987bd56e9b90bb0bc103e2289e7"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" DROP CONSTRAINT "FK_6769b190f7ad4bba69ea7033c78"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" DROP CONSTRAINT "FK_3fb85efee4d86c4460ee62c8058"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" DROP CONSTRAINT "FK_dbb79dd650bf655eaaee2aca705"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" DROP CONSTRAINT "FK_97c8ae8c6672cfd98566848f57a"`);
        await queryRunner.query(`ALTER TABLE "tenant_whatsapp_accounts" DROP CONSTRAINT "FK_e5bcae3eb96e990398fbe173929"`);
        await queryRunner.query(`CREATE TYPE "public"."plan_limits_limitkey_enum_old" AS ENUM('USER', 'STORAGE', 'BUSINESS')`);
        await queryRunner.query(`ALTER TABLE "plan_limits" ALTER COLUMN "limitKey" TYPE "public"."plan_limits_limitkey_enum_old" USING "limitKey"::"text"::"public"."plan_limits_limitkey_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."plan_limits_limitkey_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."plan_limits_limitkey_enum_old" RENAME TO "plan_limits_limitkey_enum"`);
        await queryRunner.query(`DROP TABLE "whatsapp_templates"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_templates_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_templates_headertype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_templates_category_enum"`);
        await queryRunner.query(`DROP TYPE "public"."whatsapp_templates_moduletype_enum"`);
        await queryRunner.query(`DROP TABLE "tenant_whatsapp_account_templates"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_whatsapp_account_templates_status_enum"`);
        await queryRunner.query(`DROP TABLE "tenant_whatsapp_accounts"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_whatsapp_accounts_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tenant_whatsapp_accounts_provider_enum"`);
    }

}
