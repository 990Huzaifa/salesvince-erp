import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowMultiplePlanLimitsPerPlan1777000000000 implements MigrationInterface {
    name = 'AllowMultiplePlanLimitsPerPlan1777000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plan_limits" DROP CONSTRAINT IF EXISTS "REL_1e1c9d21c61a1e815de9591b2f"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "plan_limits" ADD CONSTRAINT "REL_1e1c9d21c61a1e815de9591b2f" UNIQUE ("plan_id")`);
    }
}
