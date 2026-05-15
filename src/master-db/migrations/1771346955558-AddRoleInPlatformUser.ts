import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoleInPlatformUser1771346955558 implements MigrationInterface {
    name = 'AddRoleInPlatformUser1771346955558'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "platform_users" DROP CONSTRAINT "FK_0b80031600f8ef4ff6213e4138f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b616fa69a7b331fc2a7906a83d"`);
        await queryRunner.query(`ALTER TABLE "platform_users" DROP COLUMN "roleId"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" ADD "isActive" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "platform_roles" ADD "isActive" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "platform_users" ADD "role_id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "FK_51f68c8bbf4a14abafe4710d07f"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" DROP CONSTRAINT "PK_51c9eb8faa285e4352508f88440"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" ADD CONSTRAINT "PK_51c9eb8faa285e4352508f88440" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" DROP CONSTRAINT "UQ_6aabb98145013f4ed1484ede485"`);
        await queryRunner.query(`ALTER TABLE "platform_roles" DROP CONSTRAINT "UQ_5da1bac52ad77c7897fc53b6ff0"`);
        await queryRunner.query(`ALTER TABLE "platform_users" ADD CONSTRAINT "UQ_b616fa69a7b331fc2a7906a83d2" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "PK_7b3d2d11cdd9ceb09a39b9d1f06"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "PK_460ea7fd861472b62afa63aeee2" PRIMARY KEY ("role_id")`);
        await queryRunner.query(`DROP INDEX "public"."IDX_51f68c8bbf4a14abafe4710d07"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP COLUMN "permission_id"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD "permission_id" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "PK_460ea7fd861472b62afa63aeee2"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "PK_7b3d2d11cdd9ceb09a39b9d1f06" PRIMARY KEY ("role_id", "permission_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_51f68c8bbf4a14abafe4710d07" ON "platform_role_permissions" ("permission_id") `);
        await queryRunner.query(`ALTER TABLE "platform_users" ADD CONSTRAINT "FK_b4a968ef87bd13f41af1ea94fc3" FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "FK_51f68c8bbf4a14abafe4710d07f" FOREIGN KEY ("permission_id") REFERENCES "platform_permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "FK_51f68c8bbf4a14abafe4710d07f"`);
        await queryRunner.query(`ALTER TABLE "platform_users" DROP CONSTRAINT "FK_b4a968ef87bd13f41af1ea94fc3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_51f68c8bbf4a14abafe4710d07"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "PK_7b3d2d11cdd9ceb09a39b9d1f06"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "PK_460ea7fd861472b62afa63aeee2" PRIMARY KEY ("role_id")`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP COLUMN "permission_id"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD "permission_id" uuid NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_51f68c8bbf4a14abafe4710d07" ON "platform_role_permissions" ("permission_id") `);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" DROP CONSTRAINT "PK_460ea7fd861472b62afa63aeee2"`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "PK_7b3d2d11cdd9ceb09a39b9d1f06" PRIMARY KEY ("permission_id", "role_id")`);
        await queryRunner.query(`ALTER TABLE "platform_users" DROP CONSTRAINT "UQ_b616fa69a7b331fc2a7906a83d2"`);
        await queryRunner.query(`ALTER TABLE "platform_roles" ADD CONSTRAINT "UQ_5da1bac52ad77c7897fc53b6ff0" UNIQUE ("name")`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" ADD CONSTRAINT "UQ_6aabb98145013f4ed1484ede485" UNIQUE ("name")`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" DROP CONSTRAINT "PK_51c9eb8faa285e4352508f88440"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" ADD CONSTRAINT "PK_51c9eb8faa285e4352508f88440" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "FK_51f68c8bbf4a14abafe4710d07f" FOREIGN KEY ("permission_id") REFERENCES "platform_permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "platform_users" DROP COLUMN "role_id"`);
        await queryRunner.query(`ALTER TABLE "platform_roles" DROP COLUMN "isActive"`);
        await queryRunner.query(`ALTER TABLE "platform_permissions" DROP COLUMN "isActive"`);
        await queryRunner.query(`ALTER TABLE "platform_users" ADD "roleId" uuid`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b616fa69a7b331fc2a7906a83d" ON "platform_users" ("email") `);
        await queryRunner.query(`ALTER TABLE "platform_users" ADD CONSTRAINT "FK_0b80031600f8ef4ff6213e4138f" FOREIGN KEY ("roleId") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
