import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeInGeoEntities1772154123737 implements MigrationInterface {
    name = 'ChangeInGeoEntities1772154123737'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "FK_f3bbd0bc19bb6d8a887add08461"`);
        await queryRunner.query(`ALTER TABLE "countries" DROP CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18"`);
        await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "countries" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "countries" ADD CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_1229b56aa12cae674b824fccd13"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd995ee0bec1758b056730f3b8"`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "PK_09ab30ca0975c02656483265f4f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "PK_09ab30ca0975c02656483265f4f" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "country_id"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "country_id" integer NOT NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ad75dbfcb7d82e3295d41f87b"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "cities" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "cities" DROP COLUMN "state_id"`);
        await queryRunner.query(`ALTER TABLE "cities" ADD "state_id" integer NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fd995ee0bec1758b056730f3b8" ON "states" ("country_id", "name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9ad75dbfcb7d82e3295d41f87b" ON "cities" ("state_id", "name") `);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "FK_f3bbd0bc19bb6d8a887add08461" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "FK_1229b56aa12cae674b824fccd13" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_1229b56aa12cae674b824fccd13"`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "FK_f3bbd0bc19bb6d8a887add08461"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ad75dbfcb7d82e3295d41f87b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd995ee0bec1758b056730f3b8"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP COLUMN "state_id"`);
        await queryRunner.query(`ALTER TABLE "cities" ADD "state_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e"`);
        await queryRunner.query(`ALTER TABLE "cities" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "cities" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e" PRIMARY KEY ("id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9ad75dbfcb7d82e3295d41f87b" ON "cities" ("name", "state_id") `);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "country_id"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "country_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "PK_09ab30ca0975c02656483265f4f"`);
        await queryRunner.query(`ALTER TABLE "states" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "states" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "PK_09ab30ca0975c02656483265f4f" PRIMARY KEY ("id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fd995ee0bec1758b056730f3b8" ON "states" ("country_id", "name") `);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "FK_1229b56aa12cae674b824fccd13" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "countries" DROP CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18"`);
        await queryRunner.query(`ALTER TABLE "countries" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "countries" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "countries" ADD CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "FK_f3bbd0bc19bb6d8a887add08461" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
