import { MigrationInterface, QueryRunner } from "typeorm";

export class ClaimFixeAgains1792046283706 implements MigrationInterface {
    name = 'ClaimFixeAgains1792046283706'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claim_items" DROP CONSTRAINT "FK_456c3324de7c57829d94d48802d"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f"`);
        await queryRunner.query(`ALTER TABLE "claim_items" DROP COLUMN "claimBatchId"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ALTER COLUMN "claimItemId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ADD CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f" FOREIGN KEY ("claimItemId") REFERENCES "claim_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "claim_batches" DROP CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f"`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ALTER COLUMN "claimItemId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "claim_items" ADD "claimBatchId" uuid`);
        await queryRunner.query(`ALTER TABLE "claim_batches" ADD CONSTRAINT "FK_93da92dbc1bcb020cfdab2fa10f" FOREIGN KEY ("claimItemId") REFERENCES "claim_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "claim_items" ADD CONSTRAINT "FK_456c3324de7c57829d94d48802d" FOREIGN KEY ("claimBatchId") REFERENCES "claim_batches"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
