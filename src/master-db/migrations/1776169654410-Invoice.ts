import { MigrationInterface, QueryRunner } from "typeorm";

export class Invoice1776169654410 implements MigrationInterface {
    name = 'Invoice1776169654410'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."plan_limits_limitkey_enum" AS ENUM('USER', 'STORAGE')`);
        await queryRunner.query(`CREATE TABLE "plan_limits" ("id" SERIAL NOT NULL, "limitKey" "public"."plan_limits_limitkey_enum" NOT NULL, "limitValue" integer NOT NULL, "plan_id" integer, CONSTRAINT "REL_1e1c9d21c61a1e815de9591b2f" UNIQUE ("plan_id"), CONSTRAINT "PK_7e1766a42b4f6a5d98a04eb4ba9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_billingcycle_enum" AS ENUM('MONTHLY', 'YEARLY')`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_billingmodel_enum" AS ENUM('SELF_SERVE', 'SALES_DRIVEN')`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_paymentmode_enum" AS ENUM('ONLINE', 'OFFLINE')`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_collectiontype_enum" AS ENUM('AUTO', 'MANUAL')`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('ACTIVE', 'PAST_DUE', 'SUSPENDED', 'EXPIRED')`);
        await queryRunner.query(`CREATE TABLE "subscriptions" ("id" SERIAL NOT NULL, "billingCycle" "public"."subscriptions_billingcycle_enum" NOT NULL, "billingModel" "public"."subscriptions_billingmodel_enum" NOT NULL, "paymentMode" "public"."subscriptions_paymentmode_enum" NOT NULL, "collectionType" "public"."subscriptions_collectiontype_enum" NOT NULL, "status" "public"."subscriptions_status_enum" NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "cancelledAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "plan_id" integer, "tenant_id" uuid, CONSTRAINT "REL_e45fca5d912c3a2fab512ac25d" UNIQUE ("plan_id"), CONSTRAINT "REL_f6ac03431c311ccb8bbd7d3af1" UNIQUE ("tenant_id"), CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."invoices_status_enum" AS ENUM('DRAFT', 'ISSUE', 'PAID', 'OVERDUE')`);
        await queryRunner.query(`CREATE TABLE "invoices" ("id" SERIAL NOT NULL, "status" "public"."invoices_status_enum" NOT NULL, "issueDate" TIMESTAMP NOT NULL, "dueDate" TIMESTAMP NOT NULL, "subTotalAmount" integer NOT NULL, "taxAmount" integer NOT NULL, "totalAmount" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenant_id" uuid, "subscription_id" integer, CONSTRAINT "REL_440f531f452dcc4389d201b9d4" UNIQUE ("tenant_id"), CONSTRAINT "REL_5152c0aa0f851d9b95972b442e" UNIQUE ("subscription_id"), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "invoice_items" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "quantity" integer NOT NULL, "unitPrice" integer NOT NULL, "totalAmount" integer NOT NULL, "invoice_id" integer, CONSTRAINT "REL_dc991d555664682cfe892eea2c" UNIQUE ("invoice_id"), CONSTRAINT "PK_53b99f9e0e2945e69de1a12b75a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "payfast_price_id" character varying`);
        await queryRunner.query(`ALTER TABLE "plan_limits" ADD CONSTRAINT "FK_1e1c9d21c61a1e815de9591b2fb" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_f6ac03431c311ccb8bbd7d3af18" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_440f531f452dcc4389d201b9d4b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoice_items" ADD CONSTRAINT "FK_dc991d555664682cfe892eea2c1" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_items" DROP CONSTRAINT "FK_dc991d555664682cfe892eea2c1"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_440f531f452dcc4389d201b9d4b"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_f6ac03431c311ccb8bbd7d3af18"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc"`);
        await queryRunner.query(`ALTER TABLE "plan_limits" DROP CONSTRAINT "FK_1e1c9d21c61a1e815de9591b2fb"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "payfast_price_id"`);
        await queryRunner.query(`DROP TABLE "invoice_items"`);
        await queryRunner.query(`DROP TABLE "invoices"`);
        await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
        await queryRunner.query(`DROP TABLE "subscriptions"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_collectiontype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_paymentmode_enum"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_billingmodel_enum"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_billingcycle_enum"`);
        await queryRunner.query(`DROP TABLE "plan_limits"`);
        await queryRunner.query(`DROP TYPE "public"."plan_limits_limitkey_enum"`);
    }

}
