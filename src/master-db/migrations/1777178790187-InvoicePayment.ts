import { MigrationInterface, QueryRunner } from "typeorm";

export class InvoicePayment1777178790187 implements MigrationInterface {
    name = 'InvoicePayment1777178790187'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."invoice_payments_method_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TABLE "invoice_payments" ("id" SERIAL NOT NULL, "paymentDate" TIMESTAMP NOT NULL, "amount" character varying NOT NULL, "method" "public"."invoice_payments_method_enum" NOT NULL, "remarks" character varying, "reference" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "invoice_id" integer, CONSTRAINT "PK_e19c9ebfa432289f510de7b4e99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "invoice_payments" ADD CONSTRAINT "FK_e94fa427d3da279450dba6f4aa6" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_payments" DROP CONSTRAINT "FK_e94fa427d3da279450dba6f4aa6"`);
        await queryRunner.query(`DROP TABLE "invoice_payments"`);
        await queryRunner.query(`DROP TYPE "public"."invoice_payments_method_enum"`);
    }

}
