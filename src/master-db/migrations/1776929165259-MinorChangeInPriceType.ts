import { MigrationInterface, QueryRunner } from "typeorm";

export class MinorChangeInPriceType1776929165259 implements MigrationInterface {
    name = 'MinorChangeInPriceType1776929165259'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "price" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "price" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "price" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "price"`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "price" integer NOT NULL`);
    }

}
