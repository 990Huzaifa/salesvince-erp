import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductSubCategoryStandalone1792070000000
  implements MigrationInterface
{
  name = 'ProductSubCategoryStandalone1792070000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_sub_categories" ALTER COLUMN "categoryId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "product_sub_categories" SET "categoryId" = (SELECT "id" FROM "product_categories" LIMIT 1) WHERE "categoryId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_sub_categories" ALTER COLUMN "categoryId" SET NOT NULL`,
    );
  }
}
