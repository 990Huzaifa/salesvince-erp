import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Must run outside a transaction: Postgres forbids using a newly added enum
 * value in the same transaction that added it (and older PG versions forbid
 * ADD VALUE inside a transaction entirely).
 */
export class SaleOrderPrebookedStatus1792080000000
  implements MigrationInterface
{
  name = 'SaleOrderPrebookedStatus1792080000000';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."sale_orders_orderstatus_enum" ADD VALUE IF NOT EXISTS 'PREBOOKED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transactions_referencetype_enum" ADD VALUE IF NOT EXISTS 'PREBOOKING_VOUCHER'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot easily remove a value from an enum; no-op.
  }
}
