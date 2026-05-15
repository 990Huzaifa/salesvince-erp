import { MigrationInterface, QueryRunner } from "typeorm";

export class AddonChange1776928600268 implements MigrationInterface {
    name = 'AddonChange1776928600268'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "monthly_price"`);
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "yearly_price"`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "price" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "billing_cycle" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "billing_cycle"`);
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "yearly_price" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "monthly_price" integer NOT NULL`);
    }

}
