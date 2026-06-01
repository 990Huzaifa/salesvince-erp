import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSaleReturnWarehouse1780400000002
  implements MigrationInterface
{
  name = 'RemoveSaleReturnWarehouse1780400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_returns" DROP CONSTRAINT IF EXISTS "FK_sale_returns_warehouse"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" DROP COLUMN IF EXISTS "warehouseId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_returns" ADD "warehouseId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "sale_returns" ADD CONSTRAINT "FK_sale_returns_warehouse" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
