import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProvisioningJobsAndLogs1770626457242 implements MigrationInterface {
    name = 'AddProvisioningJobsAndLogs1770626457242'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenant_provisioning_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL, "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "finishedAt" TIMESTAMP, "errorMessage" text, "tenant_id" uuid, CONSTRAINT "PK_94a5652117329e68e0acd9563aa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenant_provisioning_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "level" character varying NOT NULL, "message" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "job_id" uuid, CONSTRAINT "PK_fc3e0e87f21e4a99083ab6f28fd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "tenant_provisioning_jobs" ADD CONSTRAINT "FK_f3868b220b3177a499e36f3a2dc" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_provisioning_logs" ADD CONSTRAINT "FK_c6fe417e20a8118636d8bbce2fd" FOREIGN KEY ("job_id") REFERENCES "tenant_provisioning_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_provisioning_logs" DROP CONSTRAINT "FK_c6fe417e20a8118636d8bbce2fd"`);
        await queryRunner.query(`ALTER TABLE "tenant_provisioning_jobs" DROP CONSTRAINT "FK_f3868b220b3177a499e36f3a2dc"`);
        await queryRunner.query(`DROP TABLE "tenant_provisioning_logs"`);
        await queryRunner.query(`DROP TABLE "tenant_provisioning_jobs"`);
    }

}
