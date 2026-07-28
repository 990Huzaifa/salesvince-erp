import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPin1785218493353 implements MigrationInterface {
    name = 'AddPin1785218493353'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "pin" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pin"`);
    }

}
