import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleOrderPrebookedStatus1792080000000
  implements MigrationInterface
{
  name = 'SaleOrderPrebookedStatus1792080000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."sale_orders_orderstatus_enum" ADD VALUE 'PREBOOKED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE 'PREBOOKING_VOUCHER'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot easily remove a value from an enum; no-op.
  }
}
