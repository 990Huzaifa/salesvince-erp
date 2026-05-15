import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeInAddonAgain1777014061218 implements MigrationInterface {
    name = 'ChangeInAddonAgain1777014061218'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" ADD "currency" character varying NOT NULL DEFAULT 'PKR'`);
        await queryRunner.query(`ALTER TABLE "addons" ALTER COLUMN "is_active" SET DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "addons" ALTER COLUMN "is_active" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "addons" DROP COLUMN "currency"`);
    }

}
