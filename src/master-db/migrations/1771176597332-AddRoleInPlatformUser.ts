import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoleInPlatformUser1771176597332 implements MigrationInterface {
    name = 'AddRoleInPlatformUser1771176597332'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "platform_users" ADD "roleId" uuid`);
        await queryRunner.query(`ALTER TABLE "platform_users" ADD CONSTRAINT "FK_0b80031600f8ef4ff6213e4138f" FOREIGN KEY ("roleId") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "platform_users" DROP CONSTRAINT "FK_0b80031600f8ef4ff6213e4138f"`);
        await queryRunner.query(`ALTER TABLE "platform_users" DROP COLUMN "roleId"`);
    }

}
