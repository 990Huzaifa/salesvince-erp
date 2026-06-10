import { MigrationInterface, QueryRunner } from "typeorm";

export class TenantDb1781086814293 implements MigrationInterface {
    name = 'TenantDb1781086814293'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sale_order_items" DROP COLUMN "saleMarginPercentage"`);
        await queryRunner.query(`ALTER TABLE "sale_order_items" DROP COLUMN "saleMarginAmount"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP COLUMN "saleUnitMarginAmount"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP COLUMN "saleUnitMarginPercentage"`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP COLUMN "saleUnitMarginAmount"`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP COLUMN "saleUnitMarginPercentage"`);
        await queryRunner.query(`ALTER TABLE "grn_items" DROP COLUMN "saleUnitMarginPercentage"`);
        await queryRunner.query(`ALTER TABLE "grn_items" DROP COLUMN "saleUnitMarginAmount"`);
        await queryRunner.query(`ALTER TABLE "sale_order_items" ADD "saleUnitPrice" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "batchs" ADD "saleUnitPrice" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "saleUnitPrice" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "grn_items" ADD "saleUnitPrice" numeric(18,2) NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "grn_items" DROP COLUMN "saleUnitPrice"`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP COLUMN "saleUnitPrice"`);
        await queryRunner.query(`ALTER TABLE "batchs" DROP COLUMN "saleUnitPrice"`);
        await queryRunner.query(`ALTER TABLE "sale_order_items" DROP COLUMN "saleUnitPrice"`);
        await queryRunner.query(`ALTER TABLE "grn_items" ADD "saleUnitMarginAmount" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "grn_items" ADD "saleUnitMarginPercentage" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "saleUnitMarginPercentage" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "purchase_order_items" ADD "saleUnitMarginAmount" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "batchs" ADD "saleUnitMarginPercentage" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "batchs" ADD "saleUnitMarginAmount" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sale_order_items" ADD "saleMarginAmount" numeric(18,2) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sale_order_items" ADD "saleMarginPercentage" numeric(18,2) NOT NULL`);
    }

}
