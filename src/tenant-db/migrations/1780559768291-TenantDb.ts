import { MigrationInterface, QueryRunner } from "typeorm";

export class TenantDb1780559768291 implements MigrationInterface {
    name = 'TenantDb1780559768291'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payslip_lines_componenttype_enum" AS ENUM('earning', 'deduction')`);
        await queryRunner.query(`CREATE TYPE "public"."payslip_lines_calculationtype_enum" AS ENUM('fixed', 'percentage', 'formula', 'manual')`);
        await queryRunner.query(`CREATE TABLE "payslip_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "payslipId" uuid NOT NULL, "salaryComponentId" uuid NOT NULL, "componentType" "public"."payslip_lines_componenttype_enum" NOT NULL, "calculationType" "public"."payslip_lines_calculationtype_enum" NOT NULL DEFAULT 'fixed', "value" numeric(15,2) NOT NULL DEFAULT '0', "calculatedAmount" numeric(15,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_e2318c56871094d11383dd2ce42" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cab24bb37771f108c67e27000c" ON "payslip_lines" ("payslipId", "salaryComponentId") `);
        await queryRunner.query(`CREATE TYPE "public"."payslips_status_enum" AS ENUM('draft', 'approved', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "payslips" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "payrollRunId" uuid NOT NULL, "employeeId" uuid NOT NULL, "employeeSalaryStructureId" uuid NOT NULL, "periodYear" integer NOT NULL, "periodMonth" integer NOT NULL, "paymentDate" date NOT NULL, "basicSalary" numeric(15,2) NOT NULL DEFAULT '0', "grossSalary" numeric(15,2) NOT NULL DEFAULT '0', "totalEarnings" numeric(15,2) NOT NULL DEFAULT '0', "totalDeductions" numeric(15,2) NOT NULL DEFAULT '0', "netSalary" numeric(15,2) NOT NULL DEFAULT '0', "currency" character varying(10) NOT NULL DEFAULT 'PKR', "status" "public"."payslips_status_enum" NOT NULL DEFAULT 'draft', "approvedAt" TIMESTAMP, "approvedBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_2b1cd07059daf60cc440c9976e1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c606e9c47cc9d7bfe6d3a58acb" ON "payslips" ("businessId", "employeeId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ee5bae81f62c8855325c8d6275" ON "payslips" ("payrollRunId", "employeeId") `);
        await queryRunner.query(`CREATE TYPE "public"."payroll_runs_status_enum" AS ENUM('draft', 'generated', 'closed')`);
        await queryRunner.query(`CREATE TABLE "payroll_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "periodYear" integer NOT NULL, "periodMonth" integer NOT NULL, "payPolicyId" uuid, "status" "public"."payroll_runs_status_enum" NOT NULL DEFAULT 'draft', "generatedAt" TIMESTAMP, "createdBy" uuid, "updatedBy" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_6049f42c972640c0eb99ba8035e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7ed5f4b6e2fd5bc02941036f55" ON "payroll_runs" ("businessId", "periodYear", "periodMonth") `);
        await queryRunner.query(`CREATE TYPE "public"."salary_vouchers_paymentmethod_enum" AS ENUM('CASH', 'CHEQUE', 'TRANSFER', 'ONLINE', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."salary_vouchers_status_enum" AS ENUM('PENDING', 'PAID', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "salary_vouchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "voucherNumber" character varying NOT NULL, "employeeId" uuid NOT NULL, "payslipId" uuid NOT NULL, "accId" uuid NOT NULL, "paymentMethod" "public"."salary_vouchers_paymentmethod_enum" NOT NULL, "chequeNumber" character varying, "chequeDate" TIMESTAMP, "bankName" character varying, "paymentDate" TIMESTAMP NOT NULL, "paymentAmount" numeric(20,2) NOT NULL, "remarks" character varying, "createdBy" uuid, "status" "public"."salary_vouchers_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_87b192aa3f749a11d1b66155794" UNIQUE ("voucherNumber"), CONSTRAINT "PK_9ff76de888e4e2ec7ab03c0847f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0fa6af551daa9bdef458f7e7ae" ON "salary_vouchers" ("businessId", "payslipId") `);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD "employeeId" uuid`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1df35b3ae00677b6d3b960868e"`);
        await queryRunner.query(`ALTER TYPE "public"."chart_of_accounts_accountkind_enum" RENAME TO "chart_of_accounts_accountkind_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."chart_of_accounts_accountkind_enum" AS ENUM('SYSTEM', 'BUSINESS', 'PARTY_RECEIVABLE', 'PARTY_PAYABLE', 'EMPLOYEE_SALARY_PAYABLE', 'PRODUCT_CATEGORY', 'PRODUCT_SUB_CATEGORY', 'PRODUCT_INVENTORY')`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ALTER COLUMN "accountKind" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ALTER COLUMN "accountKind" TYPE "public"."chart_of_accounts_accountkind_enum" USING "accountKind"::"text"::"public"."chart_of_accounts_accountkind_enum"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ALTER COLUMN "accountKind" SET DEFAULT 'SYSTEM'`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_accounts_accountkind_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_1df35b3ae00677b6d3b960868e" ON "chart_of_accounts" ("businessId", "accountKind") `);
        await queryRunner.query(`CREATE INDEX "IDX_8b4377e3230e18c148480dcca8" ON "chart_of_accounts" ("businessId", "employeeId") `);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_381bbbb980ce448e5d3013aa432" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" ADD CONSTRAINT "FK_4120b66854f1024209a0709d5dd" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" ADD CONSTRAINT "FK_aa3f66463a0c7d976aadc26879f" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" ADD CONSTRAINT "FK_3838d62aca136aabe44f1725578" FOREIGN KEY ("salaryComponentId") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslips" ADD CONSTRAINT "FK_553f091638efb7725e4513870e0" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslips" ADD CONSTRAINT "FK_900143f20e6cd2fc0153db2242c" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslips" ADD CONSTRAINT "FK_3fa0aa64d0a6d751ea49e6cd804" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payslips" ADD CONSTRAINT "FK_60775dc5178a6610c4e57e5cfad" FOREIGN KEY ("employeeSalaryStructureId") REFERENCES "employee_salary_structures"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD CONSTRAINT "FK_70098613f4512bf182c881d24ad" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" ADD CONSTRAINT "FK_438f904e347c9666886e8425290" FOREIGN KEY ("payPolicyId") REFERENCES "pay_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_b0dbb56b85b18526c404d6fd0f8" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_d78daa853a19b5506bc71caae2a" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_d93de67ee158f50fd86b6637afd" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_ffb4820f9642a1dc4646c13622a" FOREIGN KEY ("accId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" ADD CONSTRAINT "FK_4c5bcfb3a20c699c37f6a670cd1" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_4c5bcfb3a20c699c37f6a670cd1"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_ffb4820f9642a1dc4646c13622a"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_d93de67ee158f50fd86b6637afd"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_d78daa853a19b5506bc71caae2a"`);
        await queryRunner.query(`ALTER TABLE "salary_vouchers" DROP CONSTRAINT "FK_b0dbb56b85b18526c404d6fd0f8"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP CONSTRAINT "FK_438f904e347c9666886e8425290"`);
        await queryRunner.query(`ALTER TABLE "payroll_runs" DROP CONSTRAINT "FK_70098613f4512bf182c881d24ad"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP CONSTRAINT "FK_60775dc5178a6610c4e57e5cfad"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP CONSTRAINT "FK_3fa0aa64d0a6d751ea49e6cd804"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP CONSTRAINT "FK_900143f20e6cd2fc0153db2242c"`);
        await queryRunner.query(`ALTER TABLE "payslips" DROP CONSTRAINT "FK_553f091638efb7725e4513870e0"`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" DROP CONSTRAINT "FK_3838d62aca136aabe44f1725578"`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" DROP CONSTRAINT "FK_aa3f66463a0c7d976aadc26879f"`);
        await queryRunner.query(`ALTER TABLE "payslip_lines" DROP CONSTRAINT "FK_4120b66854f1024209a0709d5dd"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "FK_381bbbb980ce448e5d3013aa432"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8b4377e3230e18c148480dcca8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1df35b3ae00677b6d3b960868e"`);
        await queryRunner.query(`CREATE TYPE "public"."chart_of_accounts_accountkind_enum_old" AS ENUM('SYSTEM', 'BUSINESS', 'PARTY_RECEIVABLE', 'PARTY_PAYABLE', 'PRODUCT_CATEGORY', 'PRODUCT_SUB_CATEGORY', 'PRODUCT_INVENTORY')`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ALTER COLUMN "accountKind" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ALTER COLUMN "accountKind" TYPE "public"."chart_of_accounts_accountkind_enum_old" USING "accountKind"::"text"::"public"."chart_of_accounts_accountkind_enum_old"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ALTER COLUMN "accountKind" SET DEFAULT 'SYSTEM'`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_accounts_accountkind_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."chart_of_accounts_accountkind_enum_old" RENAME TO "chart_of_accounts_accountkind_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_1df35b3ae00677b6d3b960868e" ON "chart_of_accounts" ("accountKind", "businessId") `);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP COLUMN "employeeId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0fa6af551daa9bdef458f7e7ae"`);
        await queryRunner.query(`DROP TABLE "salary_vouchers"`);
        await queryRunner.query(`DROP TYPE "public"."salary_vouchers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."salary_vouchers_paymentmethod_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7ed5f4b6e2fd5bc02941036f55"`);
        await queryRunner.query(`DROP TABLE "payroll_runs"`);
        await queryRunner.query(`DROP TYPE "public"."payroll_runs_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ee5bae81f62c8855325c8d6275"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c606e9c47cc9d7bfe6d3a58acb"`);
        await queryRunner.query(`DROP TABLE "payslips"`);
        await queryRunner.query(`DROP TYPE "public"."payslips_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cab24bb37771f108c67e27000c"`);
        await queryRunner.query(`DROP TABLE "payslip_lines"`);
        await queryRunner.query(`DROP TYPE "public"."payslip_lines_calculationtype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."payslip_lines_componenttype_enum"`);
    }

}
