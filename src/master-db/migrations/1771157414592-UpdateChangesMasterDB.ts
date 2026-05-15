import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateChangesMasterDB1771157414592 implements MigrationInterface {
    name = 'UpdateChangesMasterDB1771157414592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "platform_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "code" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6aabb98145013f4ed1484ede485" UNIQUE ("name"), CONSTRAINT "UQ_26a58814066e4035d0ca91c162a" UNIQUE ("code"), CONSTRAINT "PK_51c9eb8faa285e4352508f88440" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "platform_role_permissions" ("role_id" uuid NOT NULL, "permission_id" uuid NOT NULL, CONSTRAINT "PK_7b3d2d11cdd9ceb09a39b9d1f06" PRIMARY KEY ("role_id", "permission_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_460ea7fd861472b62afa63aeee" ON "platform_role_permissions" ("role_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_51f68c8bbf4a14abafe4710d07" ON "platform_role_permissions" ("permission_id") `);
        await queryRunner.query(`ALTER TABLE "platform_roles" ADD CONSTRAINT "UQ_5da1bac52ad77c7897fc53b6ff0" UNIQUE ("name")`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "FK_460ea7fd861472b62afa63aeee2" FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "FK_51f68c8bbf4a14abafe4710d07f" FOREIGN KEY ("permission_id") REFERENCES "platform_permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "FK_51f68c8bbf4a14abafe4710d07f"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "FK_460ea7fd861472b62afa63aeee2"`);
        await queryRunner.query(`ALTER TABLE "platform_roles" DROP CONSTRAINT "UQ_5da1bac52ad77c7897fc53b6ff0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_51f68c8bbf4a14abafe4710d07"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_460ea7fd861472b62afa63aeee"`);
        await queryRunner.query(`DROP TABLE "platform_role_permissions"`);
        await queryRunner.query(`DROP TABLE "platform_permissions"`);
    }

}
