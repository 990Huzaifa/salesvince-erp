import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPurchaseReturnStatus1780400000000 implements MigrationInterface {
  name = 'AddPurchaseReturnStatus1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."purchase_returns_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" ADD "status" "public"."purchase_returns_status_enum" NOT NULL DEFAULT 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_returns" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."purchase_returns_status_enum"`,
    );
  }
}
