import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangesInSubscription1776334634172 implements MigrationInterface {
    name = 'ChangesInSubscription1776334634172'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "REL_e45fca5d912c3a2fab512ac25d"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "plan_id"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD "planId" integer`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "cancelledAt" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_7536cba909dd7584a4640cad7d5" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_7536cba909dd7584a4640cad7d5"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ALTER COLUMN "cancelledAt" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "planId"`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD "plan_id" integer`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "REL_e45fca5d912c3a2fab512ac25d" UNIQUE ("plan_id")`);
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD CONSTRAINT "FK_e45fca5d912c3a2fab512ac25dc" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
