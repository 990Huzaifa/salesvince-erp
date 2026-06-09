import { MigrationInterface, QueryRunner } from 'typeorm';

export class DailyBackupLimit1781000000000 implements MigrationInterface {
    name = 'DailyBackupLimit1781000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TYPE "public"."plan_limits_limitkey_enum" RENAME TO "plan_limits_limitkey_enum_old"`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."plan_limits_limitkey_enum" AS ENUM('USER', 'STORAGE', 'BUSINESS', 'EMPLOYEES', 'SQL_AGENT_DAILY', 'SQL_AGENT_MONTHLY', 'WHATSAPP', 'DAILY_BACKUP')`,
        );
        await queryRunner.query(
            `ALTER TABLE "plan_limits" ALTER COLUMN "limitKey" TYPE "public"."plan_limits_limitkey_enum" USING "limitKey"::"text"::"public"."plan_limits_limitkey_enum"`,
        );
        await queryRunner.query(`DROP TYPE "public"."plan_limits_limitkey_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TYPE "public"."plan_limits_limitkey_enum_old" AS ENUM('USER', 'STORAGE', 'BUSINESS', 'EMPLOYEES', 'SQL_AGENT_DAILY', 'SQL_AGENT_MONTHLY', 'WHATSAPP')`,
        );
        await queryRunner.query(
            `ALTER TABLE "plan_limits" ALTER COLUMN "limitKey" TYPE "public"."plan_limits_limitkey_enum_old" USING "limitKey"::"text"::"public"."plan_limits_limitkey_enum_old"`,
        );
        await queryRunner.query(`DROP TYPE "public"."plan_limits_limitkey_enum"`);
        await queryRunner.query(
            `ALTER TYPE "public"."plan_limits_limitkey_enum_old" RENAME TO "plan_limits_limitkey_enum"`,
        );
    }
}
