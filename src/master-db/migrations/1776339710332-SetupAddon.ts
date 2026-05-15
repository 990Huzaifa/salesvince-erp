import { MigrationInterface, QueryRunner } from "typeorm";

export class SetupAddon1776339710332 implements MigrationInterface {
    name = 'SetupAddon1776339710332'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "addons" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" character varying NOT NULL, "monthly_price" integer NOT NULL, "yearly_price" integer NOT NULL, "limitKey" character varying NOT NULL, "limitValue" integer NOT NULL, "currency" character varying NOT NULL, "is_active" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cd49fb3dc0558f02cb6fe6cc138" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "subscription_addons" ("id" SERIAL NOT NULL, "quantity" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "subscription_id" integer, "addon_id" integer, CONSTRAINT "PK_2648ce4c6031da6cfb93f33665e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "subscription_addons" ADD CONSTRAINT "FK_a6967de14fe6bf60070019bea34" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "subscription_addons" ADD CONSTRAINT "FK_a75c88d555c47aec5dd4736829a" FOREIGN KEY ("addon_id") REFERENCES "addons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscription_addons" DROP CONSTRAINT "FK_a75c88d555c47aec5dd4736829a"`);
        await queryRunner.query(`ALTER TABLE "subscription_addons" DROP CONSTRAINT "FK_a6967de14fe6bf60070019bea34"`);
        await queryRunner.query(`DROP TABLE "subscription_addons"`);
        await queryRunner.query(`DROP TABLE "addons"`);
    }

}
