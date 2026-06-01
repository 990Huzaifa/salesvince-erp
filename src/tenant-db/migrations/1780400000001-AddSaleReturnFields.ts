import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSaleReturnFields1780400000001 implements MigrationInterface {
  name = 'AddSaleReturnFields1780400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sale_returns_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" ADD "status" "public"."sale_returns_status_enum" NOT NULL DEFAULT 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sale_returns" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."sale_returns_status_enum"`);
  }
}
