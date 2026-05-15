import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangesInAnnouncement1776265121381 implements MigrationInterface {
    name = 'ChangesInAnnouncement1776265121381'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "announcements" ADD "created_by" uuid`);
        await queryRunner.query(`ALTER TABLE "announcements" ADD CONSTRAINT "FK_40bd4946a00669c5fb7e6d972f0" FOREIGN KEY ("created_by") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "announcements" DROP CONSTRAINT "FK_40bd4946a00669c5fb7e6d972f0"`);
        await queryRunner.query(`ALTER TABLE "announcements" DROP COLUMN "created_by"`);
    }

}
