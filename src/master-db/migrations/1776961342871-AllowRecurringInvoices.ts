import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowRecurringInvoices1776961342871 implements MigrationInterface {
    name = 'AllowRecurringInvoices1776961342871'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_440f531f452dcc4389d201b9d4b"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "REL_440f531f452dcc4389d201b9d4"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "REL_5152c0aa0f851d9b95972b442e"`);
        await queryRunner.query(`ALTER TABLE "invoice_items" DROP CONSTRAINT "FK_dc991d555664682cfe892eea2c1"`);
        await queryRunner.query(`ALTER TABLE "invoice_items" DROP CONSTRAINT "REL_dc991d555664682cfe892eea2c"`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_440f531f452dcc4389d201b9d4b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoice_items" ADD CONSTRAINT "FK_dc991d555664682cfe892eea2c1" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_items" DROP CONSTRAINT "FK_dc991d555664682cfe892eea2c1"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0"`);
        await queryRunner.query(`ALTER TABLE "invoices" DROP CONSTRAINT "FK_440f531f452dcc4389d201b9d4b"`);
        await queryRunner.query(`ALTER TABLE "invoice_items" ADD CONSTRAINT "REL_dc991d555664682cfe892eea2c" UNIQUE ("invoice_id")`);
        await queryRunner.query(`ALTER TABLE "invoice_items" ADD CONSTRAINT "FK_dc991d555664682cfe892eea2c1" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "REL_5152c0aa0f851d9b95972b442e" UNIQUE ("subscription_id")`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "REL_440f531f452dcc4389d201b9d4" UNIQUE ("tenant_id")`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_5152c0aa0f851d9b95972b442e0" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "invoices" ADD CONSTRAINT "FK_440f531f452dcc4389d201b9d4b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
