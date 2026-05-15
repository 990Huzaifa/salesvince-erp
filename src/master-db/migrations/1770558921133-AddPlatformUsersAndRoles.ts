import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPlatformUsersAndRoles1770558921133 implements MigrationInterface {
    name = 'AddPlatformUsersAndRoles1770558921133'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "platform_roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0c27defb5e677a03b7ff0f45ceb" UNIQUE ("code"), CONSTRAINT "PK_598e373288278aa5dc8f1c2731b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "platform_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "fullName" character varying NOT NULL, "passwordHash" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_69bfedb2b67d1014d7b7741f5b4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b616fa69a7b331fc2a7906a83d" ON "platform_users" ("email") `);
        await queryRunner.query(`CREATE TABLE "platform_user_roles" ("platform_user_id" uuid NOT NULL, "platform_role_id" uuid NOT NULL, CONSTRAINT "PK_1074cbc4afc2f4b17451afa75dc" PRIMARY KEY ("platform_user_id", "platform_role_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_95bb95890bd4a010182713c5d4" ON "platform_user_roles" ("platform_user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_82679e8796ccd6334e5eba1a27" ON "platform_user_roles" ("platform_role_id") `);
        await queryRunner.query(`ALTER TABLE "platform_user_roles" ADD CONSTRAINT "FK_95bb95890bd4a010182713c5d48" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "platform_user_roles" ADD CONSTRAINT "FK_82679e8796ccd6334e5eba1a270" FOREIGN KEY ("platform_role_id") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "platform_user_roles" DROP CONSTRAINT "FK_82679e8796ccd6334e5eba1a270"`);
        await queryRunner.query(`ALTER TABLE "platform_user_roles" DROP CONSTRAINT "FK_95bb95890bd4a010182713c5d48"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_82679e8796ccd6334e5eba1a27"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_95bb95890bd4a010182713c5d4"`);
        await queryRunner.query(`DROP TABLE "platform_user_roles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b616fa69a7b331fc2a7906a83d"`);
        await queryRunner.query(`DROP TABLE "platform_users"`);
        await queryRunner.query(`DROP TABLE "platform_roles"`);
    }

}
