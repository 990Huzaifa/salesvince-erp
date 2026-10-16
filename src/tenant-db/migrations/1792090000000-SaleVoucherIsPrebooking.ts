import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleVoucherIsPrebooking1792090000000
  implements MigrationInterface
{
  name = 'SaleVoucherIsPrebooking1792090000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_vouchers" ADD "isPrebooking" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_vouchers" DROP COLUMN "isPrebooking"`,
    );
  }
}
