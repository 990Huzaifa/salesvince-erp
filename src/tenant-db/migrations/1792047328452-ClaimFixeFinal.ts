import { MigrationInterface, QueryRunner } from "typeorm";

export class ClaimFixeFinal1792047328452 implements MigrationInterface {
    name = 'ClaimFixeFinal1792047328452'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_0a33c53744d71cf76a7ef12cb95"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ALTER COLUMN "claimId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ALTER COLUMN "claimItemId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ADD CONSTRAINT "FK_0a33c53744d71cf76a7ef12cb95" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ADD CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f" FOREIGN KEY ("claimItemId") REFERENCES "claim_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_0a33c53744d71cf76a7ef12cb95"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ALTER COLUMN "claimItemId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ALTER COLUMN "claimId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ADD CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f" FOREIGN KEY ("claimItemId") REFERENCES "claim_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ADD CONSTRAINT "FK_0a33c53744d71cf76a7ef12cb95" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
