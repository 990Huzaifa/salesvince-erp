import { MigrationInterface, QueryRunner } from "typeorm";

export class Plan1776080665823 implements MigrationInterface {
    name = 'Plan1776080665823'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "plans" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "stripe_price_id" character varying, "slug" character varying NOT NULL, "description" character varying NOT NULL, "currency" character varying NOT NULL, "monthly_price" integer NOT NULL, "yearly_price" integer NOT NULL, "is_active" boolean NOT NULL, "is_display" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3720521a81c7c24fe9b7202ba61" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "plans"`);
    }

}
