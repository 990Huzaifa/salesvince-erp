import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep claim_batches.claimId / claimItemId NOT NULL.
 * (An earlier auto-gen briefly tried to drop NOT NULL — do not allow that.)
 */
export class ClaimFixeFinal1792047328452 implements MigrationInterface {
  name = 'ClaimFixeFinal1792047328452';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claim_batches" ALTER COLUMN "claimId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" ALTER COLUMN "claimItemId" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "claim_batches" ALTER COLUMN "claimItemId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "claim_batches" ALTER COLUMN "claimId" DROP NOT NULL`,
    );
  }
}
