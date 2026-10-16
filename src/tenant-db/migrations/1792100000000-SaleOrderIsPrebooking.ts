import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleOrderIsPrebooking1792100000000 implements MigrationInterface {
  name = 'SaleOrderIsPrebooking1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_orders" ADD "isPrebooking" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "sale_orders" SET "isPrebooking" = true WHERE "orderStatus" = 'PREBOOKED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_orders" DROP COLUMN "isPrebooking"`,
    );
  }
}
