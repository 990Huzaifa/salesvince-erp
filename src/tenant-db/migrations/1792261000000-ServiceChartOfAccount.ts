import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Must run outside a transaction: Postgres forbids using a newly added enum
 * value in the same transaction that added it.
 */
export class ServiceChartOfAccount1792261000000 implements MigrationInterface {
  name = 'ServiceChartOfAccount1792261000000';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."chart_of_accounts_accountkind_enum" ADD VALUE IF NOT EXISTS 'SERVICE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "serviceId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" DROP CONSTRAINT IF EXISTS "FK_chart_of_accounts_serviceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_chart_of_accounts_serviceId"
        FOREIGN KEY ("serviceId") REFERENCES "services"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" DROP CONSTRAINT IF EXISTS "FK_chart_of_accounts_serviceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chart_of_accounts" DROP COLUMN IF EXISTS "serviceId"`,
    );
    // Postgres cannot remove an enum value; 'SERVICE' stays in the type.
  }
}
