import { MigrationInterface, QueryRunner } from "typeorm";

export class MajorChangesInEntities1776926437219 implements MigrationInterface {
    name = 'MajorChangesInEntities1776926437219'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "monthly_price"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "yearly_price"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "billingCycle"`);
        await queryRunner.query(`DROP TYPE "public"."subscriptions_billingcycle_enum"`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "price" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "billing_cycle" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "billing_cycle"`);
        await queryRunner.query(`ALTER TABLE "plans" DROP COLUMN "price"`);
        await queryRunner.query(`CREATE TYPE "public"."subscriptions_billingcycle_enum" AS ENUM('MONTHLY', 'YEARLY')`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD "billingCycle" "public"."subscriptions_billingcycle_enum" NOT NULL`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "yearly_price" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "plans" ADD "monthly_price" integer NOT NULL`);
    }

}
