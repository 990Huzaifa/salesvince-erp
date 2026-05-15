import { MigrationInterface, QueryRunner } from "typeorm";

export class AddModulesSys1770803140891 implements MigrationInterface {
    name = 'AddModulesSys1770803140891'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "modules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a57f2b3bd9ebb022212e634f601" UNIQUE ("key"), CONSTRAINT "PK_7dbefd488bd96c5bf31f0ce0c95" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenant_modules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "tenantId" uuid, "moduleId" uuid, CONSTRAINT "UQ_7f3f26bc515f78df09868642259" UNIQUE ("tenantId", "moduleId"), CONSTRAINT "PK_b0d534b6c523b8b1d5e64aa23c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant_modules" ADD CONSTRAINT "FK_54b5bb2fadb6ada4fe57a9e2701" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_modules" ADD CONSTRAINT "FK_a001196031d22c837d0e45c450e" FOREIGN KEY ("moduleId") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_modules" DROP CONSTRAINT "FK_a001196031d22c837d0e45c450e"`);
        await queryRunner.query(`ALTER TABLE "tenant_modules" DROP CONSTRAINT "FK_54b5bb2fadb6ada4fe57a9e2701"`);
        await queryRunner.query(`DROP TABLE "tenant_modules"`);
        await queryRunner.query(`DROP TABLE "modules"`);
    }

}
