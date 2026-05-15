import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangesInPlan1776257253699 implements MigrationInterface {
    name = 'ChangesInPlan1776257253699'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plan_limits" DROP CONSTRAINT "FK_1e1c9d21c61a1e815de9591b2fb"`);
        await queryRunner.query(`ALTER TABLE "plan_limits" ADD CONSTRAINT "FK_1e1c9d21c61a1e815de9591b2fb" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plan_limits" DROP CONSTRAINT "FK_1e1c9d21c61a1e815de9591b2fb"`);
        await queryRunner.query(`ALTER TABLE "plan_limits" ADD CONSTRAINT "FK_1e1c9d21c61a1e815de9591b2fb" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
