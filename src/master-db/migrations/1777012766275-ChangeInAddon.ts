import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeInAddon1777012766275 implements MigrationInterface {
    name = 'ChangeInAddon1777012766275'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "currency"`);
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "billing_cycle"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" ADD "billing_cycle" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "addons" ADD "currency" character varying NOT NULL`);
    }

}
