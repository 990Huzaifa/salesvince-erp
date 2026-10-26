import { MigrationInterface, QueryRunner } from 'typeorm';

export class BatchVendorIdNullable1792210000000 implements MigrationInterface {
  name = 'BatchVendorIdNullable1792210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "batchs" DROP CONSTRAINT "FK_e46db5a3c5fb291e54ed32d9755"`,
    );

    await queryRunner.query(
      `ALTER TABLE "batchs" ALTER COLUMN "vendorId" DROP NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "batchs"
      ADD CONSTRAINT "FK_e46db5a3c5fb291e54ed32d9755"
      FOREIGN KEY ("vendorId") REFERENCES "parties"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "batchs" DROP CONSTRAINT "FK_e46db5a3c5fb291e54ed32d9755"`,
    );

    await queryRunner.query(`
      UPDATE "batchs"
      SET "vendorId" = (
        SELECT p."id"
        FROM "parties" p
        WHERE p."businessId" = "batchs"."businessId"
        ORDER BY p."createdAt" ASC
        LIMIT 1
      )
      WHERE "vendorId" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "batchs" ALTER COLUMN "vendorId" SET NOT NULL`,
    );

    await queryRunner.query(`
      ALTER TABLE "batchs"
      ADD CONSTRAINT "FK_e46db5a3c5fb291e54ed32d9755"
      FOREIGN KEY ("vendorId") REFERENCES "parties"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }
}
