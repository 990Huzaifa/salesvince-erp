import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeInGeoEntity1776848758315 implements MigrationInterface {
    name = 'ChangeInGeoEntity1776848758315'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" DROP COLUMN "country_id"`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" ADD "country_id" character varying`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" DROP COLUMN "state_id"`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" ADD "state_id" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" DROP COLUMN "state_id"`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" ADD "state_id" uuid`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" DROP COLUMN "country_id"`);
        await queryRunner.query(`ALTER TABLE "tenant_geo_policies" ADD "country_id" uuid`);
    }

}
