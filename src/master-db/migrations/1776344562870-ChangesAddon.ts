import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangesAddon1776344562870 implements MigrationInterface {
    name = 'ChangesAddon1776344562870'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" ADD "stripe_price_id" character varying`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "payfast_price_id" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "payfast_price_id"`);
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "stripe_price_id"`);
    }

}
