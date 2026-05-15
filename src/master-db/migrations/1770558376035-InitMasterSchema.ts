import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMasterSchema1770558376035 implements MigrationInterface {
    name = 'InitMasterSchema1770558376035'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3021c18db2b363ae9324c826c5a" UNIQUE ("code"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenant_db_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "host" character varying NOT NULL, "port" integer NOT NULL, "database" character varying NOT NULL, "username" character varying NOT NULL, "password" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid, CONSTRAINT "REL_59638e8ce71cd06be80bd37c43" UNIQUE ("tenantId"), CONSTRAINT "PK_40e7bedb00643ccc59b1c8828be" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant_db_configs" ADD CONSTRAINT "FK_59638e8ce71cd06be80bd37c43b" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_db_configs" DROP CONSTRAINT "FK_59638e8ce71cd06be80bd37c43b"`);
        await queryRunner.query(`DROP TABLE "tenant_db_configs"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
    }

}
