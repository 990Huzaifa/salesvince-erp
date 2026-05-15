import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGEOData1771404552576 implements MigrationInterface {
    name = 'AddGEOData1771404552576'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "countries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "iso_code" character varying(10) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fa1376321185575cf2226b1491" ON "countries" ("name") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_31d60a54633e88225b40081e18" ON "countries" ("iso_code") `);
        await queryRunner.query(`CREATE TABLE "states" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "country_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "code" character varying(20), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_09ab30ca0975c02656483265f4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fd995ee0bec1758b056730f3b8" ON "states" ("country_id", "name") `);
        await queryRunner.query(`CREATE TABLE "cities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "state_id" uuid NOT NULL, "name" character varying(150) NOT NULL, "code" character varying(20), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9ad75dbfcb7d82e3295d41f87b" ON "cities" ("state_id", "name") `);
        await queryRunner.query(`ALTER TABLE "states" ADD CONSTRAINT "FK_f3bbd0bc19bb6d8a887add08461" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "FK_1229b56aa12cae674b824fccd13" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "FK_1229b56aa12cae674b824fccd13"`);
        await queryRunner.query(`ALTER TABLE "states" DROP CONSTRAINT "FK_f3bbd0bc19bb6d8a887add08461"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ad75dbfcb7d82e3295d41f87b"`);
        await queryRunner.query(`DROP TABLE "cities"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd995ee0bec1758b056730f3b8"`);
        await queryRunner.query(`DROP TABLE "states"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_31d60a54633e88225b40081e18"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fa1376321185575cf2226b1491"`);
        await queryRunner.query(`DROP TABLE "countries"`);
    }

}
