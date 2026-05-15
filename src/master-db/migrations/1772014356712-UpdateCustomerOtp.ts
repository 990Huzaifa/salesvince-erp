import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateCustomerOtp1772014356712 implements MigrationInterface {
    name = 'UpdateCustomerOtp1772014356712'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customers" RENAME COLUMN "email_verification_otp_hash" TO "email_verification_otp"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "customers" RENAME COLUMN "email_verification_otp" TO "email_verification_otp_hash"`);
    }

}
