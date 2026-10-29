import { MigrationInterface, QueryRunner } from "typeorm";

export class TenantDocumentTemplatesMultiAssign1793200000000
  implements MigrationInterface
{
  name = "TenantDocumentTemplatesMultiAssign1793200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_document_templates" DROP CONSTRAINT "UQ_tenant_document_templates_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_document_templates" ADD CONSTRAINT "UQ_tenant_document_templates_tenant_template" UNIQUE ("tenantId", "templateId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_document_templates_tenantId" ON "tenant_document_templates" ("tenantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_tenant_document_templates_tenantId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_document_templates" DROP CONSTRAINT "UQ_tenant_document_templates_tenant_template"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_document_templates" ADD CONSTRAINT "UQ_tenant_document_templates_tenant" UNIQUE ("tenantId")`,
    );
  }
}
