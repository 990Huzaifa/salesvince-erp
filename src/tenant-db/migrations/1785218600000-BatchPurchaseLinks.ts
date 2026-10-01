import { MigrationInterface, QueryRunner } from "typeorm";

export class BatchPurchaseLinks1785218600000 implements MigrationInterface {
    name = 'BatchPurchaseLinks1785218600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "batchs" ADD "purchasedQty" integer`);
        await queryRunner.query(`ALTER TABLE "batchs" ADD "grnId" uuid`);
        await queryRunner.query(`ALTER TABLE "batchs" ADD "purchaseInvoiceId" uuid`);
        await queryRunner.query(`
            ALTER TABLE "batchs"
            ADD CONSTRAINT "FK_batchs_grnId"
            FOREIGN KEY ("grnId") REFERENCES "goods_receive_notes"("id")
            ON DELETE SET NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "batchs"
            ADD CONSTRAINT "FK_batchs_purchaseInvoiceId"
            FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id")
            ON DELETE SET NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "batchs" DROP CONSTRAINT "FK_batchs_purchaseInvoiceId"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP CONSTRAINT "FK_batchs_grnId"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP COLUMN "purchaseInvoiceId"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP COLUMN "grnId"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP COLUMN "purchasedQty"`);
    }

}
